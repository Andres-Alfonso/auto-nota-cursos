import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { NotificationZone } from '../entities/notification-zone.entity';
import { User } from '../entities/user.entity';
import { Club } from '../entities/club.entity';
import { VideoRoom } from '../entities/video-room.entity';
import { ClubUser } from '../entities/club-user.entity';
import { GeneralProgressVideoRoom } from '../entities/general-progress-video-room.entity';
import { Evaluation } from '../entities/evaluation.entity';
import { EvaluationClub } from '../entities/evaluation-club.entity';
import { EvaluationUser } from '../entities/evaluation-user.entity';
// import { Certificate } from '../entities/certificate.entity';
import { Answer } from '../entities/answer.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CourseMetricsService {
  private readonly logger = new Logger(CourseMetricsService.name);
  
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Club)
    private clubsRepository: Repository<Club>,
    @InjectRepository(VideoRoom)
    private videoRoomsRepository: Repository<VideoRoom>,
    @InjectRepository(ClubUser)
    private clubUsersRepository: Repository<ClubUser>,
    @InjectRepository(GeneralProgressVideoRoom)
    private progressRepository: Repository<GeneralProgressVideoRoom>,
    @InjectRepository(Evaluation)
    private evaluationsRepository: Repository<Evaluation>,
    @InjectRepository(EvaluationClub)
    private evaluationClubsRepository: Repository<EvaluationClub>,
    @InjectRepository(EvaluationUser)
    private evaluationUsersRepository: Repository<EvaluationUser>,
    @InjectRepository(Answer)
    private answersRepository: Repository<Answer>,
    @InjectRepository(NotificationZone)
    private notificationsRepository: Repository<NotificationZone>,
    private connection: Connection,
    private configService: ConfigService,
  ) {}

  /**
   * Genera el reporte de estatus por curso y lo guarda como archivo Excel
   */
  async generateCourseStatusReport(
    clientId: number,
    userId: number,
    startDate: Date,
    endDate: Date,
    searchUser: string = '',
    searchEmail: string = '',
    searchIdentification: string = '',
    searchCourse: string = '',
    clubId?: number,
  ): Promise<void> {
    try {

        this.logger.warn(`Se crea registro de reporte en notificaciones`);
      // Crear notificación inicial
      const notificationId = await this.createNotification(
        userId,
        'Generando Reporte de Estatus por Curso',
        'El reporte está siendo generado. Esto puede tomar unos minutos.',
        'info',
        { reportType: 'course_status', status: 'processing' }
      );

      // Proceso asíncrono para generar el reporte
      this.processReportGeneration(
        notificationId,
        userId,
        clientId,
        startDate,
        endDate,
        searchUser,
        searchEmail,
        searchIdentification,
        searchCourse,
        clubId
      );

      return;
    } catch (error) {
      this.logger.error(`Error al iniciar la generación del reporte: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Proceso asíncrono para generar el reporte
   */
  private async processReportGeneration(
    notificationId: number,
    userId: number,
    clientId: number,
    startDate: Date,
    endDate: Date,
    searchUser: string,
    searchEmail: string,
    searchIdentification: string,
    searchCourse: string,
    clubId?: number,
  ): Promise<void> {
    try {
      // 1. Obtener clubes
      const clubs = await this.getClubs(clientId, searchCourse, clubId);

      this.logger.warn(`Total clubes encontrados: ${clubs.length}`);
      
      // 2. Obtener usuarios
      const users = await this.getUsers(clientId, searchUser, searchEmail, searchIdentification);
      
      this.logger.warn(`Total usuarios encontrados: ${users.length}`);

      // 3. Obtener relaciones entre clubes y usuarios
      const clubIds = clubs.map(club => club.id);
      const userIds = users.map(user => user.id);
      
      const clubUsers = await this.getClubUsers(userIds, clubIds);
      
      // 4. Obtener progreso de usuarios
      const userProgress = await this.getProgressForUsers(userIds, clubIds);
      this.logger.warn(`Total progreso de usuarios encontrado: ${Object.keys(userProgress).length}`);
      
      // 5. Obtener datos de evaluaciones
      const evaluationData = await this.getEvaluationDataForUsers(userIds, clubIds);
      this.logger.warn(`Total evaluaciones de usuarios encontrado: ${Object.keys(evaluationData).length}`);


      
      // 6. Generar datos para el Excel
      const reportData: any[] = [];
      
        for (const user of users) {
            const userData = this.processUserData(user, clubs, clubUsers, userProgress, evaluationData);
            reportData.push(userData);
        }
        
        // this.logger.warn('Generando datos para el Excel');
        // // // 7. Crear archivo Excel
        // const fileName = `course_status_report_${Date.now()}.xlsx`;
        // const filePath = await this.createExcelFile2Streaming(fileName, clubs, reportData);

        this.logger.warn('Generando datos para el CSV');
        // // 7. Crear archivo Excel
        const fileName = `course_status_report_${Date.now()}.csv`;
        const filePath = await this.createCSVFile(fileName, clubs, reportData);
        
        // 8. Actualizar la notificación con el enlace de descarga
        const downloadUrl = `https://homologation-notes.kalmsystem.com/api/v1/api/reports/download/${fileName}`;
        await this.updateNotification(
          notificationId,
          'Reporte de Estatus por Curso Listo',
          'Tu reporte está listo para descargar.',
          'success',
          { 
            reportType: 'course_status', 
            status: 'completed', 
            downloadUrl,
            fileName
          }
        );
    } catch (error) {
      this.logger.error(`Error al generar el reporte: ${error.message}`, error.stack);
      
      // Actualizar la notificación con el error
      await this.updateNotification(
        notificationId,
        'Error al Generar Reporte',
        'Ocurrió un error al generar el reporte. Por favor, intenta nuevamente.',
        'error',
        { reportType: 'course_status', status: 'error', error: error.message }
      );
    }
  }

  /**
   * Obtiene los clubes según los filtros proporcionados
   */
  private async getClubs(clientId: number, searchCourse: string, clubId?: number): Promise<Club[]> {
    const queryBuilder = this.clubsRepository
      .createQueryBuilder('club')
      .leftJoinAndSelect('club.clubTranslation', 'translation')
      .where('club.client_id = :clientId', { clientId });
    
    if (searchCourse) {
      queryBuilder.andWhere('translation.title LIKE :title', { title: `%${searchCourse}%` });
    }
    
    if (clubId) {
      queryBuilder.andWhere('club.id = :clubId', { clubId });
    }

    // this.logger.warn(`Clubs entrados ${queryBuilder.getSql()}`);
    
    // Límite de 400 clubes para exportación
    return queryBuilder.take(400).getMany();
  }

  /**
   * Obtiene los usuarios según los filtros proporcionados
   */
  private async getUsers(
    clientId: number, 
    searchUser: string, 
    searchEmail: string, 
    searchIdentification: string
  ): Promise<User[]> {
    // Construir la consulta base
    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .where('user.client_id = :clientId', { clientId })
      .select([
        'user.id', 
        'user.identification', 
        'user.name', 
        'user.last_name', 
        'user.status_validation', 
        'user.email', 
        'user.company', 
        'user.charge'
      ]);
    
    // Aplicar filtros de búsqueda
    if (searchUser) {
      queryBuilder.andWhere('(user.name LIKE :name OR user.last_name LIKE :lastName)', { 
        name: `%${searchUser}%`, 
        lastName: `%${searchUser}%` 
      });
    }
    
    if (searchEmail) {
      queryBuilder.andWhere('user.email LIKE :email', { email: `%${searchEmail}%` });
    }
    
    if (searchIdentification) {
      queryBuilder.andWhere('user.identification LIKE :identification', { 
        identification: `%${searchIdentification}%` 
      });
    }
    
    // Obtener usuarios de la base de datos
    const users = await queryBuilder.getMany();

    
    
    // Procesar cada usuario para reemplazar campos vacíos con "N/A"
    return users.map(user => {
      // Crear un nuevo objeto para no modificar directamente la entidad
      const processedUser = { ...user };
      
      // Reemplazar campos vacíos con "N/A"
      if (!processedUser.identification || processedUser.identification.trim() === '') {
        processedUser.identification = 'N/A';
      }
      
      if (!processedUser.name || processedUser.name.trim() === '') {
        processedUser.name = 'N/A';
      }
      
      if (!processedUser.last_name || processedUser.last_name.trim() === '') {
        processedUser.last_name = 'N/A';
      }
      
      if (!processedUser.email || processedUser.email.trim() === '') {
        processedUser.email = 'N/A';
      }
      
      if (!processedUser.company || processedUser.company.trim() === '') {
        processedUser.company = 'N/A';
      }
      
      if (!processedUser.charge || processedUser.charge.trim() === '') {
        processedUser.charge = 'N/A';
      }

      // this.logger.warn(`users entrados ${user.email}, ${user.email}  ${processedUser}`);

      
      return processedUser;
    });
  }

  /**
   * Obtiene las relaciones entre usuarios y clubes
   */
  private async getClubUsers(userIds: number[], clubIds: number[]): Promise<Record<number, ClubUser[]>> {

    // Make sure the arrays are not empty
    //   if (!userIds.length || !clubIds.length) {
    //     this.logger.warn('Empty userIds or clubIds arrays, returning empty result');
    //     return {};
    // }
    
    // // Log the arrays to see if they contain valid data
    // this.logger.log(`userIds: ${JSON.stringify(userIds.slice(0, 5))}... (${userIds.length} total)`);
    // this.logger.log(`clubIds: ${JSON.stringify(clubIds)}`);
    const clubUsers = await this.clubUsersRepository
      .createQueryBuilder('clubUser')
      .where('clubUser.user_id IN (:...userIds)', { userIds })
      .andWhere('clubUser.club_id IN (:...clubIds)', { clubIds })
      .getMany();

    // this.logger.warn(`club users entrados ${clubUsers}`);

    
    // Agrupar por usuario_id
    return clubUsers.reduce((acc, clubUser) => {
      if (!acc[clubUser.user_id]) {
        acc[clubUser.user_id] = [];
      }
      acc[clubUser.user_id].push(clubUser);
      return acc;
    }, {});
  }

  /**
   * Obtiene el progreso de usuarios en los videorooms
   */
  private async getProgressForUsers(userIds: number[], clubIds: number[]): Promise<Record<number, Record<number, any>>> {
    // Obtener todos los videorooms para los clubes seleccionados
    const videorooms = await this.videoRoomsRepository
      .createQueryBuilder('videoroom')
      .where('videoroom.club_id IN (:...clubIds)', { clubIds })
      .andWhere('videoroom.enable_modules = :enableModules', { enableModules: true })
      .andWhere('videoroom.public = :public', { public: true })
      .select(['videoroom.id', 'videoroom.club_id'])
      .getMany();

    // this.logger.warn(`videorooms entrados ${videorooms} para clubes ${clubIds}`);

    
    // Agrupar videorooms por club para contar y para tener IDs
    const videoroomCounts = {};
    const videoroomsByClub = {};
    
    for (const videoroom of videorooms) {
      const clubId = videoroom.club_id;
      if (!videoroomCounts[clubId]) {
        videoroomCounts[clubId] = 0;
        videoroomsByClub[clubId] = [];
      }
      videoroomCounts[clubId]++;
      videoroomsByClub[clubId].push(videoroom.id);
    }
    
    // Resultado final
    const result = {};
    
    // Procesar cada club por separado
    for (const clubId of clubIds) {
      if (!videoroomsByClub[clubId]) {
        continue; // Si no hay videorooms para este club, continuar
      }
      
      const videoroomIds = videoroomsByClub[clubId];
      
      // Obtener el último progreso registrado para cada combinación de usuario/videoroom
      const latestProgressQuery = this.progressRepository
        .createQueryBuilder('progress')
        .select('MAX(progress.id)', 'max_id')
        .where('progress.id_user IN (:...userIds)', { userIds })
        .andWhere('progress.id_videoroom IN (:...videoroomIds)', { videoroomIds })
        .groupBy('progress.id_user')
        .addGroupBy('progress.id_videoroom');

        
        // this.logger.warn(`latestProgressQuery entrados ${latestProgressQuery.getSql()}`);
      
      const latestProgressIds = await latestProgressQuery.getRawMany();
      
      // this.logger.warn(`latestProgressIds entrados ${latestProgressIds}`);

      if (latestProgressIds.length === 0) {
        continue;
      }
      
      const maxIds = latestProgressIds.map(item => item.max_id);
      
      // Obtener los registros de progreso utilizando los IDs obtenidos
      const progress = await this.progressRepository
        .createQueryBuilder('g')
        .innerJoin('videorooms', 'v', 'g.id_videoroom = v.id')
        .where('g.id IN (:...maxIds)', { maxIds })
        .andWhere('v.club_id = :clubId', { clubId })
        .select([
          'g.id', 
          'g.id_user', 
          'g.id_videoroom', 
          'g.porcen', 
          'g.updated_at', 
          'v.club_id'
        ])
        .getRawMany();

      // this.logger.warn(`progress entrados ${progress}`);

      
      // Organizar los datos por usuario
      for (const item of progress) {
        const userId = item.g_id_user;
        
        if (!result[userId]) {
          result[userId] = {};
        }
        
        if (!result[userId][clubId]) {
          result[userId][clubId] = {
            total_percent: 0,
            progress_items: [],
            last_updated: null
          };
        }
        
        result[userId][clubId].progress_items.push(item);
        
        // Actualizar la fecha de última actividad
        const itemDate = new Date(item.g_updated_at);
        if (result[userId][clubId].last_updated === null || 
            itemDate > result[userId][clubId].last_updated) {
          result[userId][clubId].last_updated = itemDate;
        }
      }
      
      // Calcular porcentajes totales para este club
      for (const userId in result) {
        if (result[userId][clubId]) {
          // Contar videorooms únicos para los que el usuario tiene progreso
          const uniqueVideorooms = new Set(
            result[userId][clubId].progress_items.map(item => item.g_id_videoroom)
          ).size;
          
          // Sumar el porcentaje solo una vez por videoroom
          let totalPercent = 0;
          if (videoroomCounts[clubId] > 0) {
            totalPercent = result[userId][clubId].progress_items
              .reduce((sum, item) => sum + parseInt(item.g_porcen), 0);
            
            // Normalizar al rango 0-100 (dividir por cantidad de videorooms del club)
            totalPercent = Math.floor(totalPercent / videoroomCounts[clubId]);
            
            // Asegurar que el porcentaje esté dentro del rango válido
            totalPercent = Math.max(0, Math.min(100, totalPercent));
          }
          
          result[userId][clubId].total_percent = totalPercent;
          result[userId][clubId].unique_videorooms = uniqueVideorooms;
          result[userId][clubId].total_videorooms = videoroomCounts[clubId];
        }
      }
    }
    
    return result;
  }

  /**
   * Obtiene los datos de evaluaciones y horas de intensidad desde los clubes
   */
  private async getEvaluationDataForUsers(userIds: number[], clubIds: number[]): Promise<any> {
    // Safety check for empty arrays
    if (!userIds.length || !clubIds.length) {
        return {
            evaluations_by_club: {},
            evaluation_results: {},
            club_hours: {},
            survey_answers: {}
        };
    }
    
    // Since you're only using one club_id (1133), use direct equality for better performance
    const isSingleClub = clubIds.length === 1;
    
    try {
        // Obtain all evaluations for selected clubs
        let queryBuilder = this.evaluationsRepository
            .createQueryBuilder('evaluation')
            .innerJoinAndSelect(
                'evaluation.evaluationClubs',
                'evaluationClub'
            )
            .where('evaluation.enable_certificate = :enableCertificate', { enableCertificate: true })
            .select(['evaluation.id', 'evaluation.type', 'evaluation.approving_note', 'evaluationClub.club_id']);
        
        // Add the club filter conditionally
        if (isSingleClub) {
            queryBuilder = queryBuilder.andWhere('evaluationClub.club_id = :clubId', { clubId: clubIds[0] });
        } else {
            queryBuilder = queryBuilder.andWhere('evaluationClub.club_id IN (:...clubIds)', { clubIds });
        }
        
        const evaluations = await queryBuilder.getMany();
        
        // If no evaluations found, return empty result
        if (!evaluations.length) {
            this.logger.warn('No evaluations found for the specified clubs');
            return {
                evaluations_by_club: {},
                evaluation_results: {},
                club_hours: {},
                survey_answers: {}
            };
        }
        
        // Rest of your code remains the same
        // Map evaluations by club
        const evaluationsByClub = {};
        for (const evaluation of evaluations) {
            for (const evalClub of evaluation.evaluationClubs) {
                evaluationsByClub[evalClub.club_id] = evaluation;
            }
        }
        
        // Get evaluation IDs
        const evaluationIds = evaluations.map(e => e.id);
        
        // Safety check - if no evaluation IDs, return early
        if (!evaluationIds.length) {
            return {
                evaluations_by_club: evaluationsByClub,
                evaluation_results: {},
                club_hours: {},
                survey_answers: {}
            };
        }
        
        // Get evaluation results
        const evaluationUsers = await this.evaluationUsersRepository
            .createQueryBuilder('evaluationUser')
            .where('evaluationUser.user_id IN (:...userIds)', { userIds })
            .andWhere('evaluationUser.evaluation_id IN (:...evaluationIds)', { evaluationIds })
            .select(['evaluationUser.user_id', 'evaluationUser.evaluation_id', 'evaluationUser.nota', 'evaluationUser.approved'])
            .getMany();
        
        // Get club intensity hours
        let clubsQuery = this.clubsRepository
            .createQueryBuilder('club')
            .select(['club.id', 'club.inten_hour']);
        
        if (isSingleClub) {
            clubsQuery = clubsQuery.where('club.id = :clubId', { clubId: clubIds[0] });
        } else {
            clubsQuery = clubsQuery.where('club.id IN (:...clubIds)', { clubIds });
        }
        
        const clubs = await clubsQuery.getMany();
        
        // Create hours map by club
        const clubHoursMap = clubs.reduce((acc, club) => {
            acc[club.id] = club.inten_hour || 0;
            return acc;
        }, {});
        
        // Group results by user and evaluation
        const evaluationResults = {};
        for (const result of evaluationUsers) {
            if (!evaluationResults[result.user_id]) {
                evaluationResults[result.user_id] = {};
            }
            evaluationResults[result.user_id][result.evaluation_id] = result;
        }
        
        // For surveys, get if user has responded
        const surveyEvaluationIds = evaluations
            .filter(e => e.type === 'survey')
            .map(e => e.id);
        
        const surveyAnswers = {};
        
        if (surveyEvaluationIds.length > 0) {
            const answers = await this.answersRepository
                .createQueryBuilder('answer')
                .where('answer.user_id IN (:...userIds)', { userIds })
                .andWhere('answer.evaluation_id IN (:...surveyEvaluationIds)', { surveyEvaluationIds })
                .select(['answer.user_id', 'answer.evaluation_id'])
                .distinct(true)
                .getMany();
            
            for (const answer of answers) {
                if (!surveyAnswers[answer.user_id]) {
                    surveyAnswers[answer.user_id] = {};
                }
                surveyAnswers[answer.user_id][answer.evaluation_id] = true;
            }
        }
        
        // Return all processed data
        return {
            evaluations_by_club: evaluationsByClub,
            evaluation_results: evaluationResults,
            club_hours: clubHoursMap,
            survey_answers: surveyAnswers
        };
    } catch (error) {
        this.logger.error(`Error in getEvaluationDataForUsers: ${error.message}`, error.stack);
        // Return empty result structure instead of failing
        return {
            evaluations_by_club: {},
            evaluation_results: {},
            club_hours: {},
            survey_answers: {}
        };
    }
}

  /**
   * Procesa los datos de usuario para el reporte
   */
  private processUserData(
    user: User, 
    clubs: Club[], 
    clubUsers: Record<number, ClubUser[]>, 
    userProgress: Record<number, Record<number, any>>, 
    evaluationData: any
  ): any {
    const active = user.status_validation === '1' ? 'Activo' : 'Inactivo';

    const userData: any = {
      active_inactive: active,
      identification: user.identification,
      name: user.name,
      last_name: user.last_name,
      email: user.email,
      role: user.charge,
      company: user.company,
    };



    for (const club of clubs) {
      // Verificar inscripción del usuario en el club
      const isEnrolled = clubUsers[user.id] && 
                      clubUsers[user.id].some(cu => cu.club_id === club.id);

      // this.logger.warn(`isEnrolled ${isEnrolled} para club ${club.id} y usuario ${user.id}`);
      
      // Valores por defecto
      userData[`club_${club.id}_percentage`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_hours`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_date`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_score`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_certified`] = isEnrolled ? 'No' : 'N/A';


      // this.logger.warn(`progress ${JSON.stringify(userProgress, null, 2)}`);

      
      // Procesar progreso si existe
      if (userProgress[user.id] && userProgress[user.id][club.id]) {
        const progress = userProgress[user.id][club.id];

        // agregando el porcentaje total
        // this.logger.warn(`progress ${Math.round(progress.total_percent)} para club ${club.id} y usuario ${user.id}`);
        
        userData[`club_${club.id}_date`] = progress.last_updated;
        userData[`club_${club.id}_percentage`] = `${Math.round(progress.total_percent)} %`;
      }
      
      // Verificar si el club tiene evaluación
      if (evaluationData.evaluations_by_club[club.id]) {
        const evaluation = evaluationData.evaluations_by_club[club.id];

        // encontrar la evaluación del club
        // this.logger.warn(`evaluation ${evaluation} para club ${club.id} y usuario ${user.id}`);
        
        // Obtener horas de intensidad desde el club
        let hours = 0;
        if (evaluationData.club_hours[club.id]) {
          hours = evaluationData.club_hours[club.id];
        }
        userData[`club_${club.id}_hours`] = hours;
        
        // Procesar resultado de evaluación
        if (evaluation.type === 'survey') {
          // Para evaluaciones tipo encuesta
          const hasAnswered = evaluationData.survey_answers[user.id] && 
                            evaluationData.survey_answers[user.id][evaluation.id];

          // this.logger.warn(`hasAnswered ${hasAnswered} para club ${club.id} y usuario ${user.id}`);
          
          if (hasAnswered) {
            userData[`club_${club.id}_score`] = 'Completado';
            userData[`club_${club.id}_certified`] = 'Si';
          } else {
            userData[`club_${club.id}_score`] = 'Pendiente';
            userData[`club_${club.id}_certified`] = 'No';
          }
        } else {
          // Para evaluaciones normales
          if (evaluationData.evaluation_results[user.id] && 
              evaluationData.evaluation_results[user.id][evaluation.id]) {
            const result = evaluationData.evaluation_results[user.id][evaluation.id];

            // this.logger.warn(`evaluation data ${JSON.stringify(evaluationData, null, 2)}`);

                // this.logger.warn(`result ${JSON.stringify(result, null, 2)} para club ${club.id} y usuario ${user.id}`);
            userData[`club_${club.id}_score`] = result.nota;
            userData[`club_${club.id}_certified`] = (result.approved === 1) ? 'Si' : 'No';
          } else {
            // Si no hay resultado, marcar como pendiente
            // this.logger.warn(`No hay resultado para club ${club.id} y usuario ${user.id}`);
            userData[`club_${club.id}_score`] = 'Pendiente';
            userData[`club_${club.id}_certified`] = 'No';
          }
        }
      }
    }

    return userData;
  }

  /**
   * Crea un archivo Excel con los datos del reporte
   */
  private async createExcelFile(
    fileName: string, 
    clubs: Club[], 
    reportData: any[]
  ): Promise<string> {
    // Crear workbook y worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Estatus por Curso');
    
    // Definir encabezados
    const staticHeaders = [
      'Estatus', 'Identificación', 'Nombre', 'Apellido', 
      'Email', 'Cargo', 'Empresa'
    ];
    
    const headers = [...staticHeaders];
    
    // Agregar encabezados dinámicos para los clubes
    for (const club of clubs) {
        const translation = club.clubTranslation?.find(t => t.locale === 'es');
        const clubName = translation?.title || `Club ${club.id}`;
      
      headers.push(
        `${clubName} - Porcentaje`,
        `${clubName} - Horas`,
        `${clubName} - Fecha`,
        `${clubName} - Nota`,
        `${clubName} - Certificado`
      );
    }
    
    worksheet.columns = headers.map(header => ({
      header,
      key: header,
      width: 20
    }));
    
    // Agregar datos
    for (const userData of reportData) {
      const row = {
        'Estatus': userData.active_inactive,
        'Identificación': userData.identification,
        'Nombre': userData.name,
        'Apellido': userData.last_name,
        'Email': userData.email,
        'Cargo': userData.role,
        'Empresa': userData.company
      };
      
      // Agregar datos de clubes
      for (const club of clubs) {
        const translation = club.clubTranslation?.find(t => t.locale === 'es');
        const clubName = translation?.title || `Club ${club.id}`;
        
        row[`${clubName} - Porcentaje`] = userData[`club_${club.id}_percentage`];
        row[`${clubName} - Horas`] = userData[`club_${club.id}_hours`];
        
        // Formatear fecha si es objeto Date
        if (userData[`club_${club.id}_date`] instanceof Date) {
          row[`${clubName} - Fecha`] = userData[`club_${club.id}_date`].toLocaleDateString();
        } else {
          row[`${clubName} - Fecha`] = userData[`club_${club.id}_date`];
        }
        
        row[`${clubName} - Nota`] = userData[`club_${club.id}_score`];
        row[`${clubName} - Certificado`] = userData[`club_${club.id}_certified`];
      }
      
      worksheet.addRow(row);
    }
    
    // Dar formato a la tabla
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Crear directorio para reportes si no existe
    const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
    const reportsDir = path.join(uploadsDir, 'reports/course-status');
    
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Guardar archivo
    const filePath = path.join(reportsDir, fileName);
    await workbook.xlsx.writeFile(filePath);
    
    return filePath;
  }

    private async createCSVFile(
        fileName: string, 
        clubs: Club[], 
        reportData: any[]
    ): Promise<string> {
        // Directorio para reportes
        const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
        const reportsDir = path.join(uploadsDir, 'reports/course-status');
        
        // Crear directorio si no existe
        if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        // Cambiar extensión a .csv
        const csvFileName = fileName.replace('.xlsx', '.csv');
        const filePath = path.join(reportsDir, csvFileName);
        
        // Crear stream de escritura para mejor eficiencia de memoria
        const writeStream = fs.createWriteStream(filePath);
        writeStream.write('\uFEFF');
        
        // Definir encabezados estáticos
        const staticHeaders = [
        'Estatus', 'Identificación', 'Nombre', 'Apellido', 
        'Email', 'Cargo', 'Empresa'
        ];
        
        // Preparar encabezados dinámicos para los clubes
        const dynamicHeaders: any[] = [];
        for (const club of clubs) {
          const translation = club.clubTranslation?.find(t => t.locale === 'es');
          const clubName = translation?.title || `Club ${club.id}`;
          
          dynamicHeaders.push(
            `${clubName} - Porcentaje`,
            `${clubName} - Horas`,
            `${clubName} - Fecha`,
            `${clubName} - Nota`,
            `${clubName} - Certificado`
          );
        }
        

        const allHeaders = [...staticHeaders, ...dynamicHeaders];
        const escapedHeaders = allHeaders.map(header => this.escapeCSV(header));
        writeStream.write(escapedHeaders.join(',') + '\n');
        
        // Procesar y escribir datos fila por fila para minimizar el uso de memoria
        for (const userData of reportData) {
        const rowValues: any[] = [];

        // this.logger.warn(`userData ${JSON.stringify(userData, null, 2)}`);
        
        // Agregar datos estáticos
        rowValues.push(
            userData.active_inactive || '',
            userData.identification || '',
            userData.name || '',
            userData.last_name || '',
            userData.email || '',
            userData.role || '',
            userData.company || ''
        );
        
        // Agregar datos de clubes
        for (const club of clubs) {
            // Agregar cada columna para este club
            rowValues.push(
            userData[`club_${club.id}_percentage`] || '',
            userData[`club_${club.id}_hours`] || '',
            userData[`club_${club.id}_date`] instanceof Date 
                ? userData[`club_${club.id}_date`].toLocaleDateString() 
                : (userData[`club_${club.id}_date`] || ''),
            userData[`club_${club.id}_score`] || '',
            userData[`club_${club.id}_certified`] || ''
            );
        }
        
            // Escapar valores y escribir la fila
            const escapedRowValues = rowValues.map(value => this.escapeCSV(value));
            writeStream.write(escapedRowValues.join(',') + '\n'); // Unir valores ya escapados
        }
        
        // Cerrar el stream y esperar a que termine de escribir
        await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
        writeStream.end();
        });
        
        return filePath;
    }
    
    /**
     * Escapa valores para formato CSV
     * Maneja comas, comillas y saltos de línea que pueden romper el formato CSV
     */
    private escapeCSV(value: any): string {
        const stringValue = String(value === null || value === undefined ? '' : value); // Convertir a string, manejar null/undefined
    
        // Si contiene coma, comillas dobles o salto de línea, necesita escapado
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            // 1. Duplicar cualquier comilla doble existente
            const escapedValue = stringValue.replace(/"/g, '""');
            // 2. Envolver todo entre comillas dobles
            return `"${escapedValue}"`;
        }
        
        // Si no contiene caracteres especiales, devolver tal cual
        return stringValue;
    }


    /**
   * Genera un archivo Excel con datos de clubes usando streaming para optimizar el rendimiento
   * @param fileName Nombre del archivo a generar
   * @param clubs Lista de clubes a incluir en el reporte
   * @param reportData Datos de los usuarios con información de clubes
   * @returns Ruta del archivo generado
   */
  async createExcelFile2Streaming(
    fileName: string,
    clubs: any[], // Club[]
    reportData: any[]
  ): Promise<string> {
    console.time('Excel generation time');
    
    // Directorio para reportes
    const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
    const reportsDir = path.join(uploadsDir, 'reports/course-status');
    
    // Crear directorio si no existe
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Asegurar extensión .xlsx
    const excelFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    const filePath = path.join(reportsDir, excelFileName);
    
    // Crear workbook con streaming para mejor rendimiento con grandes volúmenes de datos
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: true,
      useSharedStrings: false // Desactivar para mayor velocidad
    });
    
    // Crear hoja de trabajo
    const worksheet = workbook.addWorksheet('Reporte');
    
    // Definir encabezados estáticos
    const staticHeaders = [
      'Estatus', 'Identificación', 'Nombre', 'Apellido', 
      'Email', 'Cargo', 'Empresa'
    ];
    
    // Preparar encabezados dinámicos para los clubes
    const headerLine1: string[] = [...staticHeaders];
    for (const club of clubs) {
      const translation = club.clubTranslation?.find(t => t.locale === 'es');
      const clubName = translation?.title || `Club ${club.id}`;

      // Repetimos el nombre del club 5 veces (una por subcolumna)
      for (let i = 0; i < 5; i++) {
        headerLine1.push(clubName);
      }
    }

    // Encabezados línea 2 (subcampos)
    const headerLine2: string[] = Array(staticHeaders.length).fill('');
    for (const _ of clubs) {
      headerLine2.push('Porcentaje', 'Horas', 'Fecha', 'Nota', 'Certificado');
    }

    // Escribir primera línea de encabezados
    const row1 = worksheet.addRow(headerLine1);
    row1.commit();
    
    // Escribir segunda línea de encabezados
    const row2 = worksheet.addRow(headerLine2);
    row2.commit();
    
    // Fusionar celdas de encabezados para cada club
    let columnIndex = staticHeaders.length + 1; // Comenzamos después de los encabezados estáticos (1-based en ExcelJS)
    for (const _ of clubs) {
      worksheet.mergeCells(1, columnIndex, 1, columnIndex + 4); // (fila, col, fila, col)
      columnIndex += 5;
    }
    
    // Aplicar estilos básicos a los encabezados (opcional)
    // Definir estilos para la primera fila (encabezados de clubes)
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' } // Gris claro
      };
    });
    
    // Estilos para la segunda fila (subencabezados)
    worksheet.getRow(2).eachCell((cell, colNumber) => {
      if (colNumber > staticHeaders.length) { // Solo los subencabezados de clubes
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
      }
    });
    
    // Procesar y escribir datos fila por fila en lotes para minimizar uso de memoria
    const BATCH_SIZE = 1000; // Ajustar según sea necesario
    for (let i = 0; i < reportData.length; i += BATCH_SIZE) {
      const batchData = reportData.slice(i, i + BATCH_SIZE);
      
      for (const userData of batchData) {
        const rowValues: any[] = [];
        
        // Agregar datos estáticos
        rowValues.push(
          userData.active_inactive || '',
          userData.identification || '',
          userData.name || '',
          userData.last_name || '',
          userData.email || '',
          userData.role || '',
          userData.company || ''
        );
        
        // Agregar datos de clubes
        for (const club of clubs) {
          // Agregar cada columna para este club
          const date = userData[`club_${club.id}_date`];
          let formattedDate = '';
          
          if (date instanceof Date) {
            formattedDate = date.toLocaleDateString();
          } else if (date) {
            formattedDate = date;
          }
          
          rowValues.push(
            userData[`club_${club.id}_percentage`] || '',
            userData[`club_${club.id}_hours`] || '',
            formattedDate,
            userData[`club_${club.id}_score`] || '',
            userData[`club_${club.id}_certified`] || ''
          );
        }
        
        // Escribir la fila
        const dataRow = worksheet.addRow(rowValues);
        dataRow.commit();
      }
      
      // Reportar progreso
      console.log(`Procesados ${Math.min(i + BATCH_SIZE, reportData.length)} de ${reportData.length} usuarios`);
    }
    
    // Ajustar ancho de columnas dinámicamente (opcional, puede aumentar el tiempo de procesamiento)
    // Esto es opcional y se puede omitir para mayor velocidad
    staticHeaders.forEach((_, index) => {
      const column = worksheet.getColumn(index + 1);
      column.width = 15; // Ancho fijo para columnas estáticas
    });

    // Comprometer y cerrar el libro
    await workbook.commit();
    console.timeEnd('Excel generation time');
    
    return filePath;
  }
  
  /**
   * Versión alternativa que primero crea un CSV y luego lo convierte a Excel
   * Este enfoque es útil si ya tienes la función CSV implementada y funcionando
   */
  async createCSVThenConvertToExcel(
    fileName: string,
    clubs: any[], // Club[]
    reportData: any[]
  ): Promise<string> {
    // Primero creamos el CSV (reutilizando tu función existente)
    const csvPath = await this.createCSVFile(fileName, clubs, reportData);
    
    // Luego convertimos el CSV a Excel (con formato)
    const excelFileName = fileName.replace('.csv', '.xlsx');
    const excelPath = path.join(path.dirname(csvPath), excelFileName);
    
    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte');
    
    // Leer contenido del CSV
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n');
    
    if (lines.length < 2) return csvPath; // No hay suficientes datos para procesar
    
    // Leer líneas de encabezado
    const headerLine1 = this.parseCSVLine(lines[0]);
    const headerLine2 = this.parseCSVLine(lines[1]);
    
    // Agregar encabezados a Excel
    worksheet.addRow(headerLine1);
    worksheet.addRow(headerLine2);
    
    // Fusionar celdas para encabezados
    const staticHeaders = [
      'Estatus', 'Identificación', 'Nombre', 'Apellido', 
      'Email', 'Cargo', 'Empresa'
    ];
    
    let colIndex = staticHeaders.length + 1;
    let clubCount = (headerLine1.length - staticHeaders.length) / 5;
    
    for (let i = 0; i < clubCount; i++) {
      worksheet.mergeCells(1, colIndex, 1, colIndex + 4);
      colIndex += 5;
    }
    
    // Agregar datos
    for (let i = 2; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      const rowData = this.parseCSVLine(lines[i]);
      worksheet.addRow(rowData);
    }
    
    // Aplicar estilos básicos
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { horizontal: 'center' };
    worksheet.getRow(2).font = { bold: true };
    
    // Guardar Excel
    await workbook.xlsx.writeFile(excelPath);
    
    return excelPath;
  }
  
  /**
   * Parsea una línea CSV teniendo en cuenta el escapado correcto
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let currentValue = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (insideQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Comilla doble escapada dentro de comillas
          currentValue += '"';
          i++; // Saltar la siguiente comilla
        } else {
          // Alternar estado de comillas
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // Fin del campo
        result.push(currentValue);
        currentValue = '';
      } else {
        // Carácter normal
        currentValue += char;
      }
    }
    
    // Último campo
    result.push(currentValue);
    
    return result;
  }

  /**
   * Crea una notificación en la base de datos
   */
  private async createNotification(
    userId: number,
    title: string,
    message: string,
    type: string,
    data: any
  ): Promise<number> {
    const notification = this.notificationsRepository.create({
        user_id: userId,
        title,
        message,
        type,
        data,
        read: false,
        created_at: new Date(),
        updated_at: new Date()
    });
    
    const result = await this.notificationsRepository.save(notification);
    return result.id;
  }

  /**
   * Actualiza una notificación existente
   */
  private async updateNotification(
    notificationId: number,
    title: string,
    message: string,
    type: string,
    data: any,
    read: boolean = false
  ): Promise<void> {
    await this.notificationsRepository.update(notificationId, {
      title,
      message,
      type,
      data,
      read
    });
  }
}