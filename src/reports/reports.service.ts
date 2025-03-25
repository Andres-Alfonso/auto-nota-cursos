// src/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../progress-users/entities/user.entity';
import { Club } from '../progress-users/entities/club.entity';
import { SectionClubs } from '../progress-users/entities/section-clubs.entity';
import { CustomField } from '../progress-users/entities/custom-field.entity';
import { UserCustomField } from '../progress-users/entities/user-custom-field.entity';
import { ClubUser } from '../progress-users/entities/club-user.entity';
import { GeneralProgressVideoRoom } from '../progress-users/entities/general-progress-videoroom.entity';
import { VideoRoom } from '../progress-users/entities/videoroom.entity';
import { Certificate } from '../progress-users/entities/certificate.entity';
import { Evaluation } from '../progress-users/entities/evaluation.entity';
import { EvaluationUser } from '../progress-users/entities/evaluation-user.entity';
import { Answer } from '../progress-users/entities/answer.entity';
import { ReportFilterDto } from './dto/report-filter.dto';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';


export interface UserReportData {
  active_inactive: string;
  identification: string;
  name: string;
  last_name: string;
  email: string;
  role: any;
  company: any;
  [key: string]: any; // Para propiedades dinámicas adicionales
}


@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Club)
    private clubRepository: Repository<Club>,
    @InjectRepository(SectionClubs)
    private sectionClubsRepository: Repository<SectionClubs>,
    @InjectRepository(CustomField)
    private customFieldRepository: Repository<CustomField>,
    @InjectRepository(UserCustomField)
    private userCustomFieldRepository: Repository<UserCustomField>,
    @InjectRepository(ClubUser)
    private clubUserRepository: Repository<ClubUser>,
    @InjectRepository(GeneralProgressVideoRoom)
    private generalProgressRepository: Repository<GeneralProgressVideoRoom>,
    @InjectRepository(VideoRoom)
    private videoRoomRepository: Repository<VideoRoom>,
    @InjectRepository(Certificate)
    private certificateRepository: Repository<Certificate>,
    @InjectRepository(Evaluation)
    private evaluationRepository: Repository<Evaluation>,
    @InjectRepository(EvaluationUser)
    private evaluationUserRepository: Repository<EvaluationUser>,
    @InjectRepository(Answer)
    private answerRepository: Repository<Answer>,
  ) {}

  async getClientClubs(clientId: number) {
    return this.clubRepository.find({
      where: { client_id: clientId },
      relations: ['translations'],
    });
  }

  async getClientSections(clientId: number) {
    return this.sectionClubsRepository.find({
      where: { client_id: clientId },
    });
  }

  async getClientCustomFields(clientId: number) {
    return this.customFieldRepository.find({
      where: { client_id: clientId },
      order: { order: 'ASC' },
    });
  }

  async getUserReportPreview(clientId: number, filter: ReportFilterDto) {
    const locale= 'es'
    // Obtener clubes del cliente
    const clubs = await this.getClientClubs(clientId);
    
    // Obtener campos personalizados del cliente
    const customFields = await this.getClientCustomFields(clientId);

    // Consulta base para obtener usuarios
    const usersQuery = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.identification',
        'user.name',
        'user.last_name',
        'user.last_login_at',
        'user.status_validation',
        'user.email',
        'user.charge',
        'user.company',
      ])
      .where('user.client_id = :clientId', { clientId });

    // Aplicar filtros si existen
    if (filter.startDate) {
      usersQuery.andWhere('user.created_at >= :startDate', { startDate: filter.startDate });
    }
    if (filter.endDate) {
      usersQuery.andWhere('user.created_at <= :endDate', { endDate: filter.endDate });
    }

    // Obtener solo los primeros 10 usuarios para la vista previa
    const users = await usersQuery.take(10).getMany();

    // Preparar las columnas para la tabla HTML
    const columns = [
      { title: 'Estado', field: 'active_inactive' },
      { title: 'Identificación', field: 'identification' },
      { title: 'Nombre', field: 'name' },
      { title: 'Apellido', field: 'last_name' },
      { title: 'Email', field: 'email' },
      { title: 'Rol', field: 'role' },
      { title: 'Empresa', field: 'company' },
    ];

    // Añadir columnas para campos personalizados
    customFields.forEach(field => {
      columns.push({ title: field.name, field: `custom_field_${field.id}` });
    });
    
    // Añadir columnas dinámicas para cada club
    clubs.forEach(club => {
      const translation = club.translations?.find(t => t.locale === locale) || club.translations?.[0];
      columns.push({ title: `${translation?.title || club.name} - Porcentaje`, field: `club_${club.id}_percentage` });
      columns.push({ title: `${translation?.title || club.name} - Horas`, field: `club_${club.id}_hours` });
      columns.push({ title: `${translation?.title || club.name} - Nota`, field: `club_${club.id}_score` });
      columns.push({ title: `${translation?.title || club.name} - Certificado`, field: `club_${club.id}_certified` });
    });

    // 2. Obtener todos los datos relacionados de una sola vez para todos los usuarios
    const userIds = users.map(user => user.id);
    
    // Obtener todos los datos de clubes y usuarios en paralelo
    const [
      allClubUsers,
      allUserCustomFields,
      allVideoRoomCounts,
      allGeneralProgress,
      allCertificates,
      allEvaluations,
      allEvaluationScores,
      allAnswers
    ] = await Promise.all([
      // Relaciones usuario-club
      this.clubUserRepository
        .createQueryBuilder('club_user')
        .where('club_user.user_id IN (:...userIds)', { userIds })
        .andWhere('club_user.club_id IN (:...clubIds)', { clubIds: clubs.map(club => club.id) })
        .getMany(),
      
      // Campos personalizados de todos los usuarios
      this.fetchAllUserCustomFields(userIds),
      
      // Conteo de videorooms por club
      this.fetchVideoRoomCountsByClub(clubs.map(club => club.id)),
      
      // Progreso general para todos los usuarios
      this.fetchAllUserProgress(userIds, clubs.map(club => club.id)),
      
      // Certificados para todos los clubes
      this.fetchCertificates(clubs.map(club => club.id)),
      
      // Evaluaciones para todos los clubes
      this.fetchEvaluations(clubs.map(club => club.id)),
      
      // Resultados de evaluaciones para todos los usuarios
      this.fetchAllEvaluationScores(userIds),
      
      // Respuestas de encuestas para todos los usuarios
      this.fetchAllAnswers(userIds)
    ]);
    
    // 3. Indexar los datos relacionados para acceso rápido
    const clubUserMap = this.indexByUserAndClub(allClubUsers);
    const userCustomFieldsMap = this.indexUserCustomFields(allUserCustomFields);
    const videoRoomCountMap = this.indexByClub(allVideoRoomCounts);
    const progressMap = this.indexProgressByUserAndClub(allGeneralProgress);
    const certificateMap = this.indexByClub(allCertificates);
    const evaluationMap = this.indexByClub(allEvaluations);
    const evaluationScoreMap = this.indexEvaluationScoresByUserAndEvaluation(allEvaluationScores);
    const answersMap = this.indexAnswersByUserAndEvaluation(allAnswers);

    // Procesar datos de usuarios
    const rows: UserReportData[] = [];
    for (const user of users) {
      // Procesar datos de reporte para el usuario

      const userData = this.processUserReportDataOptimized(
        user, 
        clubs, 
        clubUserMap,
        videoRoomCountMap,
        progressMap,
        certificateMap,
        evaluationMap,
        evaluationScoreMap,
        answersMap
      );
      
      // Recuperar campos personalizados del usuario
      const userCustomFields = await this.userCustomFieldRepository.find({
        where: { user_id: user.id },
        relations: ['customField'],
      });

      // Añadir campos personalizados al objeto userData
      for (const customField of userCustomFields) {
        userData[`custom_field_${customField.custom_field_id}`] = customField.value;
      }

      rows.push(userData);
    }

    return {
      columns,
      rows,
      totalUsers: await this.userRepository.count({ where: { client_id: clientId } })
    };
  }

  async downloadUserReport(clientId: number, filter: ReportFilterDto) {
    console.time('downloadUserReport');
    
    // 1. Obtener datos básicos
    const [clubs, customFieldsClient] = await Promise.all([
      this.clubRepository.find({
        where: { client_id: clientId },
      }),
      this.customFieldRepository.find({
        where: { client_id: clientId },
        order: { order: 'ASC' },
      })
    ]);
    
    // 2. Construir el libro de Excel y los encabezados
    const workbook = XLSX.utils.book_new();
    const headers = this.buildReportHeaders(clubs, customFieldsClient);
    const rows = [headers]; // La primera fila son los encabezados
    
    // 3. Obtener el total de usuarios para este cliente con los filtros aplicados
    const totalUsersQuery = this.buildUserQuery(clientId, filter);
    const totalUsers = await totalUsersQuery.getCount();
    
    console.log(`Total de usuarios a procesar: ${totalUsers}`);
    
    // 4. Procesar en lotes de 500 usuarios
    const BATCH_SIZE = 500;
    let processedUsers = 0;
    
    // Estructuras para almacenar datos relacionados para cada lote
    let clubIds = clubs.map(club => club.id);
    
    // Obtener datos que no dependen de los usuarios (pueden cargarse una sola vez)
    const [videoRoomCounts, clubCertificates, clubEvaluations] = await Promise.all([
      this.fetchVideoRoomCountsByClub(clubIds),
      this.fetchCertificates(clubIds),
      this.fetchEvaluations(clubIds)
    ]);
    
    // Indexar datos fijos
    const videoRoomCountMap = this.indexByClub(videoRoomCounts);
    const certificateMap = this.indexByClub(clubCertificates);
    const evaluationMap = this.indexByClub(clubEvaluations);
    
    // Procesar por lotes
    while (processedUsers < totalUsers) {
      // Obtener el siguiente lote de usuarios
      const usersQuery = this.buildUserQuery(clientId, filter)
        .skip(processedUsers)
        .take(BATCH_SIZE);
      
      const usersBatch = await usersQuery.getMany();
      const userIds = usersBatch.map(user => user.id);
      
      console.log(`Procesando lote de ${usersBatch.length} usuarios (${processedUsers + 1}-${processedUsers + usersBatch.length} de ${totalUsers})`);
      
      // Cargar datos relacionados para este lote específico
      const [
        batchClubUsers,
        batchUserCustomFields,
        batchGeneralProgress,
        batchEvaluationScores,
        batchAnswers
      ] = await Promise.all([
        this.fetchClubUsers(userIds, clubIds),
        this.fetchUserCustomFields(userIds),
        this.fetchAllUserProgress(userIds, clubIds),
        this.fetchAllEvaluationScores(userIds),
        this.fetchAllAnswers(userIds)
      ]);
      
      // Indexar datos para este lote
      const clubUserMap = this.indexByUserAndClub(batchClubUsers);
      const userCustomFieldsMap = this.indexUserCustomFields(batchUserCustomFields);
      const progressMap = this.indexProgressByUserAndClub(batchGeneralProgress);
      const evaluationScoreMap = this.indexEvaluationScoresByUserAndEvaluation(batchEvaluationScores);
      const answersMap = this.indexAnswersByUserAndEvaluation(batchAnswers);
      
      // Procesar cada usuario en el lote y añadir al Excel
      for (const user of usersBatch) {
        try {
          const userData = this.processUserReportDataOptimized(
            user, 
            clubs, 
            clubUserMap,
            videoRoomCountMap,
            progressMap,
            certificateMap,
            evaluationMap,
            evaluationScoreMap,
            answersMap
          );
          
          // Añadir campos personalizados
          const customFieldValues = userCustomFieldsMap[user.id] || {};
          
          // Crear la fila para el Excel directamente (sin almacenar en un objeto intermedio)
          const row = [
            userData.active_inactive,
            userData.identification,
            userData.name,
            userData.last_name,
            userData.email,
            userData.role,
            userData.company
          ];

          // Añadir campos personalizados
          customFieldsClient.forEach(field => {
            row.push(customFieldValues[field.name] || '');
          });
          
          // Añadir datos de cada club
          // clubs.forEach(club => {
          //   row.push(userData[`club_${club.id}_percentage`] || 'N/A');
          //   row.push(userData[`club_${club.id}_hours`] || 'N/A');
          //   row.push(userData[`club_${club.id}_date`] || 'N/A');
          //   row.push(userData[`club_${club.id}_score`] || 'N/A');
          //   row.push(userData[`club_${club.id}_certified`] || 'No');
          // });
          
          // Añadir la fila al arreglo
          rows.push(row);
        } catch (error) {
          console.error(`Error procesando usuario ${user.id}:`, error);
        }
      }
      
      // Forzar liberación de memoria
      global.gc && global.gc();
      
      // Actualizar contador
      processedUsers += usersBatch.length;
      console.log(`Procesados ${processedUsers} de ${totalUsers} usuarios`);
    }
    
    // 5. Crear la hoja de trabajo con todas las filas y añadirla al libro
    console.log(`Generando archivo Excel con ${rows.length} filas...`);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte de Usuarios');

    // 6. Crear la carpeta de reportes si no existe
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // 6. Generar el buffer del Excel
    // console.log('Generando buffer del archivo...');
    // const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 7. Generar un nombre de archivo único basado en la fecha y cliente
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toISOString().split('T')[1].replace(/:/g, '-').split('.')[0];
    const fileName = `reporte-usuarios-cliente${clientId}-${dateStr}-${timeStr}.xlsx`;
    const filePath = path.join(reportsDir, fileName);
    
    // 8. Escribir el archivo directamente en disco
    console.log(`Guardando archivo en: ${filePath}`);
    XLSX.writeFile(workbook, filePath);
    
    console.timeEnd('downloadUserReport');
    
    // console.timeEnd('downloadUserReport');
    // return {
    //   buffer,
    //   filename: `reporte-usuarios-${new Date().toISOString().split('T')[0]}.xlsx`
    // };
    // 9. Devolver información sobre el archivo guardado
    return {
      filePath,
      fileName,
      url: `/reports/${fileName}`, // URL relativa para acceder al archivo
      success: true
    };
  }

  private buildUserQuery(clientId: number, filter: ReportFilterDto) {
    const query = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.identification',
        'user.name',
        'user.last_name',
        'user.last_login_at',
        'user.status_validation',
        'user.email',
        'user.charge',
        'user.company',
      ])
      .where('user.client_id = :clientId', { clientId });
  
    // Aplicar filtros si existen y son valores válidos
    if (filter.startDate && filter.startDate !== '') {
      query.andWhere('user.created_at >= :startDate', { 
        startDate: new Date(filter.startDate) 
      });
    }
    
    if (filter.endDate && filter.endDate !== '') {
      // Ajustar la fecha final al final del día
      const endDate = new Date(filter.endDate);
      endDate.setHours(23, 59, 59, 999);
      
      query.andWhere('user.created_at <= :endDate', { 
        endDate: endDate 
      });
    }
  
    return query;
  }
  
  // Construye los encabezados del reporte
  private buildReportHeaders(clubs: Club[], customFields: CustomField[]) {
    const headers = [
      'Estado', 'Identificación', 'Nombre', 'Apellido', 'Email', 'Rol', 'Empresa'
    ];
    
    // Añadir encabezados para campos personalizados
    customFields.forEach(field => {
      headers.push(field.name);
    });

    // Añadir encabezados dinámicos para cada club
    clubs.forEach(club => {
      headers.push(`${club.name} - Porcentaje`);
      headers.push(`${club.name} - Horas`);
      headers.push(`${club.name} - Fecha`);
      headers.push(`${club.name} - Nota`);
      headers.push(`${club.name} - Certificado`);
    });
    
    
    
    return headers;
  }
  
  // Métodos para consultas específicas por lote
  private async fetchClubUsers(userIds: number[], clubIds: number[]) {
    return this.clubUserRepository
      .createQueryBuilder('club_user')
      .where('club_user.user_id IN (:...userIds)', { userIds })
      .andWhere('club_user.club_id IN (:...clubIds)', { clubIds })
      .getMany();
  }
  
  private async fetchUserCustomFields(userIds: number[]) {
    return this.userCustomFieldRepository
      .createQueryBuilder('ucf')
      .innerJoinAndSelect('ucf.customField', 'cf')
      .where('ucf.user_id IN (:...userIds)', { userIds })
      .getMany();
  }
  
  // Método optimizado para obtener usuarios con filtros
  private async getUsersWithFilters(clientId: number, filter: ReportFilterDto) {
    const query = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.identification',
        'user.name',
        'user.last_name',
        'user.last_login_at',
        'user.status_validation',
        'user.email',
        'user.charge',
        'user.company',
      ])
      .where('user.client_id = :clientId', { clientId });
  
    // Aplicar filtros si existen y son valores válidos
    if (filter.startDate && filter.startDate !== '') {
      query.andWhere('user.created_at >= :startDate', { 
        startDate: new Date(filter.startDate) 
      });
    }
    
    if (filter.endDate && filter.endDate !== '') {
      // Ajustar la fecha final al final del día
      const endDate = new Date(filter.endDate);
      endDate.setHours(23, 59, 59, 999);
      
      query.andWhere('user.created_at <= :endDate', { 
        endDate: endDate 
      });
    }
  
    return query.getMany();
  }
  
  // Métodos para consultas masivas
  private async fetchAllUserCustomFields(userIds: number[]) {
    const userCustomFields = await this.userCustomFieldRepository
      .createQueryBuilder('ucf')
      .innerJoinAndSelect('ucf.customField', 'cf')
      .where('ucf.user_id IN (:...userIds)', { userIds })
      .getMany();
      
    return userCustomFields;
  }
  
  private async fetchVideoRoomCountsByClub(clubIds: number[]) {
    const result = await this.videoRoomRepository
      .createQueryBuilder('vr')
      .select('vr.club_id', 'club_id')
      .addSelect('COUNT(vr.id)', 'count')
      .where('vr.club_id IN (:...clubIds)', { clubIds })
      .andWhere('vr.enable_modules = :enableModules', { enableModules: 1 })
      .andWhere('vr.public = :public', { public: 1 })
      .groupBy('vr.club_id')
      .getRawMany();
      
    return result;
  }
  
  private async fetchAllUserProgress(userIds: number[], clubIds: number[]) {
    const progress = await this.generalProgressRepository
      .createQueryBuilder('progress')
      .innerJoinAndSelect('progress.videoRoom', 'videoroom')
      .where('progress.id_user IN (:...userIds)', { userIds })
      .andWhere('videoroom.club_id IN (:...clubIds)', { clubIds })
      .andWhere('videoroom.enable_modules = :enableModules', { enableModules: 1 })
      .andWhere('videoroom.public = :public', { public: 1 })
      .orderBy('CAST(videoroom.number_module AS UNSIGNED)', 'ASC')
      .addOrderBy('progress.updated_at', 'DESC')
      .getMany();
      
    return progress;
  }
  
  private async fetchCertificates(clubIds: number[]) {
    const certificates = await this.certificateRepository
      .createQueryBuilder('certificate')
      .innerJoinAndSelect('certificate.evaluation', 'evaluation')
      .innerJoinAndSelect('evaluation.evaluationClubs', 'evaluationClub')
      .where('evaluationClub.club_id IN (:...clubIds)', { clubIds })
      .andWhere('evaluation.enable_certificate = :enableCertificate', { enableCertificate: 1 })
      .getMany();
      
    return certificates;
  }
  
  private async fetchEvaluations(clubIds: number[]) {
    const evaluations = await this.evaluationRepository
      .createQueryBuilder('evaluation')
      .innerJoinAndSelect('evaluation.evaluationClubs', 'evaluationClub')
      .where('evaluationClub.club_id IN (:...clubIds)', { clubIds })
      .andWhere('evaluation.enable_certificate = :enableCertificate', { enableCertificate: 1 })
      .getMany();
      
    return evaluations;
  }
  
  private async fetchAllEvaluationScores(userIds: number[]) {
    const scores = await this.evaluationUserRepository
      .createQueryBuilder('eu')
      .where('eu.user_id IN (:...userIds)', { userIds })
      .orderBy('eu.nota', 'DESC')
      .getMany();
      
    return scores;
  }
  
  private async fetchAllAnswers(userIds: number[]) {
    const answers = await this.answerRepository
      .createQueryBuilder('answer')
      .select('DISTINCT answer.user_id, answer.evaluation_id')
      .where('answer.user_id IN (:...userIds)', { userIds })
      .getRawMany();
      
    return answers;
  }
  
  // Métodos para indexar datos
  private indexByUserAndClub(clubUsers) {
    const map = {};
    clubUsers.forEach(cu => {
      if (!map[cu.user_id]) map[cu.user_id] = {};
      map[cu.user_id][cu.club_id] = cu;
    });
    return map;
  }
  
  private indexUserCustomFields(userCustomFields) {
    const map = {};
    userCustomFields.forEach(ucf => {
      if (!map[ucf.user_id]) map[ucf.user_id] = {};
      map[ucf.user_id][ucf.customField.name] = ucf.value;
    });
    return map;
  }
  
  private indexByClub(items) {
    const map = {};
    items.forEach(item => {
      const clubId = item.club_id || (item.evaluationClubs && item.evaluationClubs.length > 0 ? item.evaluationClubs[0].club_id : null);
      if (clubId) {
        map[clubId] = item;
      }
    });
    return map;
  }
  
  private indexProgressByUserAndClub(progressItems) {
    const map = {};
    
    // Agrupar el progreso por usuario y club
    progressItems.forEach(item => {
      const userId = item.id_user;
      const clubId = item.videoRoom.club_id;
      
      if (!map[userId]) map[userId] = {};
      if (!map[userId][clubId]) map[userId][clubId] = [];
      
      map[userId][clubId].push(item);
    });
    
    return map;
  }
  
  private indexEvaluationScoresByUserAndEvaluation(scores) {
    const map = {};
    scores.forEach(score => {
      if (!map[score.user_id]) map[score.user_id] = {};
      map[score.user_id][score.evaluation_id] = score;
    });
    return map;
  }
  
  private indexAnswersByUserAndEvaluation(answers) {
    const map = {};
    answers.forEach(answer => {
      if (!map[answer.user_id]) map[answer.user_id] = {};
      map[answer.user_id][answer.evaluation_id] = true;
    });
    return map;
  }
  
  // Método optimizado para procesar datos de usuario
  private processUserReportDataOptimized(
    user, 
    clubs, 
    clubUserMap,
    videoRoomCountMap,
    progressMap,
    certificateMap,
    evaluationMap,
    evaluationScoreMap,
    answersMap
  ) {
    // Datos base del usuario
    const userData = {
      active_inactive: user.status_validation ? 'Activo' : 'Inactivo',
      identification: user.identification,
      name: user.name,
      last_name: user.last_name,
      email: user.email,
      role: user.charge || '',
      company: user.company || '',
    };
  
    // Procesar datos para cada club
    clubs.forEach(club => {
      // Verificar si el usuario pertenece al club
      const clubUser = clubUserMap[user.id] ? clubUserMap[user.id][club.id] : null;
  
      // Inicializar valores por defecto
      userData[`club_${club.id}_percentage`] = clubUser ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_hours`] = clubUser ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_date`] = clubUser ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_score`] = clubUser ? 'N/ID' : 'N/A';
      userData[`club_${club.id}_certified`] = 'No';
  
      // Obtener número de videorooms para el club
      const videoRoomCount = videoRoomCountMap[club.id] ? parseInt(videoRoomCountMap[club.id].count) : 0;
  
      // Obtener progreso del usuario en este club
      const userProgress = progressMap[user.id] ? progressMap[user.id][club.id] || [] : [];
  
      // Calcular porcentaje total
      let porcentajeTotal = 0;
      if (videoRoomCount > 0 && userProgress.length > 0) {
        const sumPorcen = userProgress.reduce((sum, progress) => sum + progress.porcen, 0);
        porcentajeTotal = Math.round(sumPorcen / videoRoomCount);
      }
  
      // Obtener certificado para este club
      const certificate = certificateMap[club.id];
      
      // Establecer horas predeterminadas
      let hours = 1;
      if (certificate && certificate.hours && certificate.hours > 2) {
        hours = certificate.hours;
      }
  
      // Actualizar datos si hay progreso
      if (userProgress.length > 0) {
        userData[`club_${club.id}_date`] = userProgress[userProgress.length - 1].updated_at;
        userData[`club_${club.id}_percentage`] = `${Math.round(porcentajeTotal)} %`;
        userData[`club_${club.id}_hours`] = hours;
      }
  
      // Obtener evaluación para este club
      const evaluation = evaluationMap[club.id];
  
      if (evaluation) {
        if (evaluation.type === 'survey') {
          // Para evaluaciones tipo encuesta, verificar en la tabla Answers
          const hasAnswers = answersMap[user.id] && answersMap[user.id][evaluation.id];
  
          if (hasAnswers) {
            userData[`club_${club.id}_score`] = 'Completado';
            userData[`club_${club.id}_certified`] = 'Sí';
          } else {
            userData[`club_${club.id}_score`] = 'Pendiente';
            userData[`club_${club.id}_certified`] = 'No';
          }
        } else {
          // Para evaluaciones normales, buscar en evaluation_user
          const evaluationScore = evaluationScoreMap[user.id] ? evaluationScoreMap[user.id][evaluation.id] : null;
  
          if (evaluationScore) {
            userData[`club_${club.id}_score`] = evaluationScore.nota;
            userData[`club_${club.id}_certified`] = evaluationScore.approved ? 'Sí' : 'No';
          } else {
            userData[`club_${club.id}_score`] = 'Pendiente';
            userData[`club_${club.id}_certified`] = 'No';
          }
        }
      } else {
        userData[`club_${club.id}_score`] = 'N/A';
        userData[`club_${club.id}_certified`] = 'No';
      }
    });
  
    return userData;
  }
  
  // El método generateExcelFile permanece igual
  private generateExcelFile(data: any, clubs: Club[], customFields: CustomField[]) {
    // Crear un nuevo libro de trabajo
    const workbook = XLSX.utils.book_new();
    
    // Preparar los encabezados
    const headers = [
      'Estado', 'Identificación', 'Nombre', 'Apellido', 'Email', 'Rol', 'Empresa'
    ];
    
    // Añadir encabezados dinámicos para cada club
    clubs.forEach(club => {
      headers.push(`${club.name} - Porcentaje`);
      headers.push(`${club.name} - Horas`);
      headers.push(`${club.name} - Fecha`);
      headers.push(`${club.name} - Nota`);
      headers.push(`${club.name} - Certificado`);
    });
    
    // Añadir encabezados para campos personalizados
    customFields.forEach(field => {
      headers.push(field.name);
    });
    
    // Preparar los datos para el excel
    const rows: any[] = [];
    rows.push(headers);
    
    // Añadir datos de cada usuario
    Object.values(data).forEach((userData: any) => {
      const row = [
        userData.active_inactive,
        userData.identification,
        userData.name,
        userData.last_name,
        userData.email,
        userData.role,
        userData.company
      ];
      
      // Añadir datos de cada club
      clubs.forEach(club => {
        row.push(userData[`club_${club.id}_percentage`] || 'N/A');
        row.push(userData[`club_${club.id}_hours`] || 'N/A');
        row.push(userData[`club_${club.id}_date`] || 'N/A');
        row.push(userData[`club_${club.id}_score`] || 'N/A');
        row.push(userData[`club_${club.id}_certified`] || 'No');
      });
      
      // Añadir datos de campos personalizados
      customFields.forEach(field => {
        row.push(userData.custom_fields[field.name] || '');
      });
      
      rows.push(row);
    });
    
    // Crear hoja de trabajo y añadirla al libro
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte de Usuarios');
    
    // Generar buffer del archivo Excel
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    return {
      buffer,
      filename: `reporte-usuarios-${new Date().toISOString().split('T')[0]}.xlsx`
    };
  }
}