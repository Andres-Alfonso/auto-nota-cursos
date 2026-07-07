import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, DataSource } from 'typeorm';
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
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as Excel from 'exceljs';
import { ConfigService } from '@nestjs/config';
import { CustomField } from '../entities/custom-field.entity';

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
    @InjectConnection()
    private connection: Connection,
    private configService: ConfigService,
    private dataSource: DataSource, 
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
    clubIds?: number[], // Cambio: ahora recibe array de IDs
    clubStatus?: string,
    orderBy?: string,
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

      // Validar y convertir orderBy al tipo correcto
      const validOrderBy: 'user' | 'course' | undefined = 
        orderBy === 'user' || orderBy === 'course' ? orderBy : 'user';

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
        clubIds, // Pasar array de club IDs
        clubStatus,
        validOrderBy
      );

      return;
    } catch (error) {
      this.logger.error(`Error al iniciar la generación del reporte: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async getCustomFields(clientId: number): Promise<any[]> {
      const query = `
          SELECT 
              id,
              name,
              field_type,
              client_id,
              \`order\`
          FROM custom_fields
          WHERE client_id = ?
          ORDER BY \`order\` ASC
      `;
      
      const customFields = await this.connection.query(query, [clientId]);
      return customFields;
  }

  // 2. Obtener valores de custom fields para usuarios con SQL
  private async getUserCustomFieldValues(userIds: number[]): Promise<Map<number, Map<number, string>>> {
    if (userIds.length === 0) {
        return new Map();
    }
    
    const placeholders = userIds.map(() => '?').join(',');
    const query = `
        SELECT 
            ucf.user_id,
            ucf.custom_field_id,
            ucf.value
        FROM user_custom_fields ucf
        WHERE ucf.user_id IN (${placeholders})
    `;
    
    const userCustomFields = await this.connection.query(query, userIds);
    
    // Crear un mapa: userId -> customFieldId -> value
    const customFieldMap = new Map<number, Map<number, string>>();
    
    for (const ucf of userCustomFields) {
        // Verificar si existe el mapa para este usuario, si no, crearlo
        let userFieldMap = customFieldMap.get(ucf.user_id);
        if (!userFieldMap) {
            userFieldMap = new Map<number, string>();
            customFieldMap.set(ucf.user_id, userFieldMap);
        }
        // Ahora userFieldMap ya no puede ser undefined
        userFieldMap.set(ucf.custom_field_id, ucf.value || '');
    }
    
    return customFieldMap;
  }

  /**
 * Proceso asíncrono para generar el reporte - VERSIÓN CON BATCHES
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
  clubIds?: number[],
  clubStatus?: string,
  orderBy?: 'user' | 'course'
): Promise<void> {
  try {
    // VALIDACIÓN Y NORMALIZACIÓN DE FECHAS
    let validStartDate: Date | null = null;
    let validEndDate: Date | null = null;

    if (startDate) {
      validStartDate = typeof startDate === 'string'
        ? new Date(startDate)
        : new Date((startDate as Date).getTime());

      if (validStartDate && isNaN(validStartDate.getTime())) {
        this.logger.error(`startDate inválida: ${startDate}`);
        validStartDate = null;
      }
    }

    if (endDate) {
      validEndDate = typeof endDate === 'string'
        ? new Date(endDate)
        : new Date((endDate as Date).getTime());

      if (validEndDate && isNaN(validEndDate.getTime())) {
        this.logger.error(`endDate inválida: ${endDate}`);
        validEndDate = null;
      }
    }

    if (validStartDate) {
      validStartDate = new Date(Date.UTC(
        validStartDate.getFullYear(),
        validStartDate.getMonth(),
        validStartDate.getDate(),
        0, 0, 0, 0
      ));
    }

    if (validEndDate) {
      validEndDate = new Date(Date.UTC(
        validEndDate.getFullYear(),
        validEndDate.getMonth(),
        validEndDate.getDate(),
        23, 59, 59, 999
      ));
    }

    this.logger.warn(`Fechas finales → start: ${validStartDate?.toISOString()} | end: ${validEndDate?.toISOString()}`);

    // 1. Obtener clubes
    const clubs = await this.getClubs(clientId, searchCourse, clubIds, clubStatus);

    if (clubs.length === 0) {
      this.logger.error('No se pudo generar el reporte, no existen cursos');
      await this.updateNotification(
        notificationId,
        'Error al Generar Reporte',
        'Parece que no se encontraron cursos.',
        'error',
        { reportType: 'course_status', status: 'error', error: 'No se encontraron cursos' }
      );
      return;
    }

    this.logger.warn(`Total clubes encontrados: ${clubs.length}`);

    // 2. Obtener usuarios, custom fields y club-users (no dependen del lote)
    const users         = await this.getUsers(clientId, searchUser, searchEmail, searchIdentification);
    const customFields  = await this.getCustomFields(clientId);
    const resolvedClubIds = clubs.map(c => c.id);
    const userIds       = users.map(u => u.id);
    const clubUsers     = await this.getClubUsers(userIds, resolvedClubIds);
    const userCustomFieldValues = await this.getUserCustomFieldValues(userIds);

    this.logger.warn(`Usuarios: ${users.length} | Custom fields: ${customFields.length}`);

    // 3. Inicializar archivo CSV (escribe solo los headers)
    const fileName = `course_status_report_${Date.now()}.csv`;
    const { writeStream, filePath } = await this.initCSVFile(
      fileName, clubs, customFields, orderBy || 'user', clientId
    );

    // 4. Procesar en lotes y escribir directo al stream
    const BATCH_SIZE = 500;
    const totalBatches = Math.ceil(users.length / BATCH_SIZE);

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batchIndex  = Math.floor(i / BATCH_SIZE) + 1;
      const batchUsers  = users.slice(i, i + BATCH_SIZE);
      const batchUserIds = batchUsers.map(u => u.id);

      this.logger.warn(`Procesando lote ${batchIndex}/${totalBatches} (${batchUsers.length} usuarios)`);

      // Queries solo para el lote actual
      const [userProgress, evaluationData] = await Promise.all([
        this.getProgressForUsersFromModules(batchUserIds, resolvedClubIds, validStartDate, validEndDate),
        this.getEvaluationDataForUsers(batchUserIds, resolvedClubIds, validStartDate, validEndDate),
      ]);

      for (const user of batchUsers) {
        const userData = this.processUserData(user, clubs, clubUsers, userProgress, evaluationData);

        // Agregar custom fields
        const userCFValues = userCustomFieldValues.get(user.id) || new Map();
        for (const cf of customFields) {
          userData[`custom_field_${cf.id}`] = userCFValues.get(cf.id) || '';
        }

        // Escribir fila(s) al stream directamente
        this.writeUserRows(writeStream, userData, clubs, customFields, orderBy || 'user', clientId);
      }

      // userProgress y evaluationData quedan fuera de scope → el GC los libera
    }

    // 5. Cerrar el stream
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });

    this.logger.warn(`Archivo CSV generado: ${filePath}`);

    // 6. Notificar éxito
    const downloadUrl = `https://homologation-notes.kalmsystem.com/api/v1/api/reports/download/${fileName}`;
    await this.updateNotification(
      notificationId,
      'Reporte de Estatus por Curso Listo',
      'Tu reporte está listo para descargar.',
      'success',
      { reportType: 'course_status', status: 'completed', downloadUrl, fileName }
    );

  } catch (error) {
    this.logger.error(`Error al generar el reporte: ${error.message}`, error.stack);
    await this.updateNotification(
      notificationId,
      'Error al Generar Reporte',
      'Ocurrió un error al generar el reporte. Por favor, intenta nuevamente.',
      'error',
      { reportType: 'course_status', status: 'error', error: error.message }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Inicializa el archivo CSV y escribe los headers
// ─────────────────────────────────────────────────────────────
private async initCSVFile(
  fileName: string,
  clubs: Club[],
  customFields: CustomField[],
  orderBy: 'user' | 'course',
  clientId: number
): Promise<{ writeStream: fs.WriteStream; filePath: string }> {
  const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
  const reportsDir = path.join(uploadsDir, 'reports/course-status');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const csvFileName = fileName.replace('.xlsx', '.csv');
  const filePath    = path.join(reportsDir, csvFileName);
  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });

  // BOM para Excel
  writeStream.write('\uFEFF');

  // Headers estáticos
  const staticHeaders = ['Estatus', 'Identificación', 'Nombre', 'Apellido', 'Email', 'Cargo', 'Empresa'];

  // Headers custom fields
  const customFieldHeaders = customFields.map(cf => cf.name);

  let dynamicHeaders: string[];

  if (orderBy === 'course') {
    // Una fila por usuario-curso: los headers de curso son columnas fijas
    dynamicHeaders = clientId === 65
      ? ['Nombre del Curso', 'Porcentaje', 'Horas', 'Fecha Inicial', 'Fecha Final', 'Nota', 'Certificado']
      : ['Nombre del Curso', 'Porcentaje', 'Horas', 'Fecha', 'Nota', 'Certificado'];
  } else {
    // Una fila por usuario: columnas dinámicas por club
    dynamicHeaders = [];
    for (const club of clubs) {
      const translation = club.clubTranslation?.find(t => t.locale === 'es');
      const clubName    = translation?.title || `Club ${club.id}`;

      if (clientId === 65) {
        dynamicHeaders.push(clubName, 'Horas', 'Fecha Inicial', 'Fecha Final', 'Nota', 'Certificado');
      } else {
        dynamicHeaders.push(clubName, 'Horas', 'Fecha', 'Nota', 'Certificado');
      }
    }
  }

  const allHeaders   = [...staticHeaders, ...customFieldHeaders, ...dynamicHeaders];
  const escapedHeaders = allHeaders.map(h => this.escapeCSV(h));
  writeStream.write(escapedHeaders.join(',') + '\n');

  return { writeStream, filePath };
}

// ─────────────────────────────────────────────────────────────
// Escribe las filas de UN usuario al stream (soporta ambos modos)
// ─────────────────────────────────────────────────────────────
private writeUserRows(
  writeStream: fs.WriteStream,
  userData: any,
  clubs: Club[],
  customFields: CustomField[],
  orderBy: 'user' | 'course',
  clientId: number
): void {
  if (orderBy === 'course') {
    this.writeUserRowsByCourse(writeStream, userData, clubs, customFields, clientId);
  } else {
    this.writeUserRowByUser(writeStream, userData, clubs, customFields, clientId);
  }
}

// ─────────────────────────────────────────────────────────────
// Modo "por usuario": una sola fila con todos los cursos como columnas
// ─────────────────────────────────────────────────────────────
private writeUserRowByUser(
  writeStream: fs.WriteStream,
  userData: any,
  clubs: Club[],
  customFields: CustomField[],
  clientId: number
): void {
  const rowValues: any[] = [
    userData.active_inactive  || '',
    userData.identification   || '',
    userData.name             || '',
    userData.last_name        || '',
    userData.email            || '',
    userData.role             || '',
    userData.company          || '',
  ];

  for (const cf of customFields) {
    rowValues.push(userData[`custom_field_${cf.id}`] || '');
  }

  for (const club of clubs) {
    if (clientId === 65) {
      rowValues.push(
        userData[`club_${club.id}_percentage`] || '',
        userData[`club_${club.id}_hours`]      || '',
        this.parseDateField(userData[`club_${club.id}_start_date`])
      );
    } else {
      rowValues.push(
        userData[`club_${club.id}_percentage`] || '',
        userData[`club_${club.id}_hours`]      || ''
      );
    }

    rowValues.push(
      this.parseDateField(userData[`club_${club.id}_date`]),
      userData[`club_${club.id}_score`]      || '',
      userData[`club_${club.id}_certified`]  || ''
    );
  }

  writeStream.write(rowValues.map(v => this.escapeCSV(v)).join(',') + '\n');
}

// ─────────────────────────────────────────────────────────────
// Modo "por curso": una fila por cada combinación usuario-curso
// ─────────────────────────────────────────────────────────────
private writeUserRowsByCourse(
  writeStream: fs.WriteStream,
  userData: any,
  clubs: Club[],
  customFields: CustomField[],
  clientId: number
): void {
  // Columnas de usuario que se repiten en cada fila
  const userBase: any[] = [
    userData.active_inactive  || '',
    userData.identification   || '',
    userData.name             || '',
    userData.last_name        || '',
    userData.email            || '',
    userData.role             || '',
    userData.company          || '',
  ];

  for (const cf of customFields) {
    userBase.push(userData[`custom_field_${cf.id}`] || '');
  }

  for (const club of clubs) {
    const translation = club.clubTranslation?.find(t => t.locale === 'es');
    const clubName    = translation?.title || `Club ${club.id}`;

    const rowValues = [...userBase, clubName];

    if (clientId === 65) {
      rowValues.push(
        userData[`club_${club.id}_percentage`] || '',
        userData[`club_${club.id}_hours`]      || '',
        this.parseDateField(userData[`club_${club.id}_start_date`])
      );
    } else {
      rowValues.push(
        userData[`club_${club.id}_percentage`] || '',
        userData[`club_${club.id}_hours`]      || ''
      );
    }

    rowValues.push(
      this.parseDateField(userData[`club_${club.id}_date`]),
      userData[`club_${club.id}_score`]      || '',
      userData[`club_${club.id}_certified`]  || ''
    );

    writeStream.write(rowValues.map(v => this.escapeCSV(v)).join(',') + '\n');
  }
}

// ─────────────────────────────────────────────────────────────
// Helper: parsea y formatea un campo de fecha (elimina duplicación)
// ─────────────────────────────────────────────────────────────
private parseDateField(value: any): string {
  if (!value) return '';
  if (value instanceof Date) return this.formatDateForExcel(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? value : this.formatDateForExcel(parsed);
  }
  return '';
}

// ─────────────────────────────────────────────────────────────
// DEPRECATED: ya no se usa, reemplazado por initCSVFile + writeUserRows
// Se mantiene por si hay otros callers
// ─────────────────────────────────────────────────────────────
private async createCSVFile(
  fileName: string,
  clubs: Club[],
  reportData: any[],
  customFields: CustomField[],
  orderBy: 'user' | 'course' = 'user',
  clientId: number
): Promise<string> {
  const { writeStream, filePath } = await this.initCSVFile(fileName, clubs, customFields, orderBy, clientId);

  for (const userData of reportData) {
    this.writeUserRows(writeStream, userData, clubs, customFields, orderBy, clientId);
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    writeStream.end();
  });

  return filePath;
}

  /**
   * Obtiene los clubes según los filtros proporcionados
   */
  private async getClubs(clientId: number, searchCourse: string, clubIds?: number[], clubStatus?: string): Promise<Club[]> {
    const queryBuilder = this.clubsRepository
      .createQueryBuilder('club')
      .leftJoinAndSelect('club.clubTranslation', 'translation')
      .where('club.client_id = :clientId', { clientId });
    
    // Filtro por estado del club (not_visible)
    if (clubStatus === 'active') {
      queryBuilder.andWhere('(club.not_visible = :notVisible OR club.not_visible IS NULL)', { notVisible: false });
    } else if (clubStatus === 'inactive') {
      queryBuilder.andWhere('club.not_visible = :notVisible', { notVisible: true });
    }

    if (searchCourse) {
      queryBuilder.andWhere('translation.title LIKE :title', { title: `%${searchCourse}%` });
    }
    
    // Cambio principal: manejar array de clubIds en lugar de clubId único
    if (clubIds && clubIds.length > 0) {
      queryBuilder.andWhere('club.id IN (:...clubIds)', { clubIds });
    }

    // this.logger.warn(`Clubs entrados ${queryBuilder.getSql()}`);
    
    // Límite de 450 clubes para exportación
    return queryBuilder.take(600).getMany();
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
        'user.charge',
        'user.client_id'
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

  private async getProgressForUsersFromModules(
    userIds: number[], 
    clubIds: number[],
    startDate: Date | null,
    endDate: Date | null
  ): Promise<Record<number, Record<number, any>>> {

    if (!userIds.length || !clubIds.length) return {};

    // 1. Obtener todos los videorooms de los clubes en una sola query
    const videorooms = await this.dataSource
      .createQueryBuilder()
      .select(['v.id', 'v.club_id', 'v.id_polls'])
      .from('videorooms', 'v')
      .where('v.club_id IN (:...clubIds)', { clubIds })
      .andWhere('v.enable_modules = :em', { em: true })
      .andWhere('v.public = :pub', { pub: true })
      .getRawMany();

    if (!videorooms.length) return {};

    const videoroomIds = videorooms.map(v => v.v_id);
    
    // Mapas de apoyo
    const videoroomToClub: Record<number, number> = {};
    const clubVideoroomCount: Record<number, number> = {};
    for (const v of videorooms) {
      videoroomToClub[v.v_id] = v.v_club_id;
      clubVideoroomCount[v.v_club_id] = (clubVideoroomCount[v.v_club_id] || 0) + 1;
    }

    const adjustedEndDate = endDate ? new Date(endDate) : null;
    if (adjustedEndDate) adjustedEndDate.setHours(23, 59, 59, 999);

    // Función helper para agregar filtros de fecha
    const addDateFilters = (qb: any) => {
      if (startDate) qb.andWhere('up.updated_at >= :startDate', { startDate });
      if (adjustedEndDate) qb.andWhere('up.updated_at <= :endDate', { endDate: adjustedEndDate });
      return qb;
    };

    // 2. Hacer TODAS las queries de progreso en paralelo, para TODOS los usuarios y videorooms
    const [contentMap, taskMap, wallMap, activityMap, evalMap, selfEvalMap, pollMap] = await Promise.all([
      // Contenidos
      this.getBulkProgress(
        'user_pogress_video_rooms', 'up',
        ['up.id_user', 'up.id_videoroom', 'up.id_content', 'up.porcen', 'up.updated_at'],
        'up.id_videoroom IN (:...videoroomIds) AND up.id_user IN (:...userIds)',
        { videoroomIds, userIds }, startDate, adjustedEndDate,
        (r) => `${r.up_id_user}_${r.up_id_videoroom}`
      ),
      // Tareas
      this.getBulkProgress(
        'user_pogress_task_videorooms', 'up',
        ['up.id_user', 'up.id_videoroom', 'up.id_task', 'up.porcen', 'up.updated_at'],
        'up.id_videoroom IN (:...videoroomIds) AND up.id_user IN (:...userIds)',
        { videoroomIds, userIds }, startDate, adjustedEndDate,
        (r) => `${r.up_id_user}_${r.up_id_videoroom}`
      ),
      // Foros
      this.getBulkProgress(
        'user_pogress_forum_videorooms', 'up',
        ['up.id_user', 'up.id_videoroom', 'up.id_advertisements', 'up.porcen', 'up.updated_at'],
        'up.id_videoroom IN (:...videoroomIds) AND up.id_user IN (:...userIds)',
        { videoroomIds, userIds }, startDate, adjustedEndDate,
        (r) => `${r.up_id_user}_${r.up_id_videoroom}`
      ),
      // Actividades
      this.getBulkProgress(
        'user_pogress_video_room_activities', 'up',
        ['up.id_user', 'up.id_videoroom', 'up.id_activity', 'up.type', 'up.porcen', 'up.updated_at'],
        'up.id_videoroom IN (:...videoroomIds) AND up.id_user IN (:...userIds)',
        { videoroomIds, userIds }, startDate, adjustedEndDate,
        (r) => `${r.up_id_user}_${r.up_id_videoroom}`
      ),
      // Evaluaciones
      this.getBulkProgress(
        'user_pogress_evaluation_video_rooms', 'up',
        ['up.id_user', 'up.id_videoroom', 'up.id_evaluation', 'up.porcen', 'up.updated_at'],
        'up.id_videoroom IN (:...videoroomIds) AND up.id_user IN (:...userIds)',
        { videoroomIds, userIds }, startDate, adjustedEndDate,
        (r) => `${r.up_id_user}_${r.up_id_videoroom}`
      ),
      // Autoevaluaciones
      this.getBulkProgress(
        'user_pogress_selft_evaluation_videorroms', 'up',
        ['up.user_id', 'up.id_videoroom', 'up.selft_evaluations_id', 'up.porcen', 'up.updated_at'],
        'up.id_videoroom IN (:...videoroomIds) AND up.user_id IN (:...userIds)',
        { videoroomIds, userIds }, startDate, adjustedEndDate,
        (r) => `${r.up_user_id}_${r.up_id_videoroom}`
      ),
      // Polls (desde videorooms ya los tenemos, filtramos los que tienen poll)
      Promise.resolve(new Map()),
    ]);

    // 3. Contar elementos por videoroom en bulk (para normalizar el progreso)
    const [contentCounts, taskCounts, wallCounts, activityCounts, evalCounts, selfEvalCounts] = await Promise.all([
      this.getElementCountsByVideoroom('videoroom_content', 'vc', 'vc.videoroom_id', videoroomIds),
      this.getElementCountsByVideoroom('detail_tasks_videorooms', 'dt', 'dt.videorooms_id', videoroomIds),
      this.getElementCountsByVideoroom('detail_walls_video_rooms', 'dw', 'dw.videorooms_id', videoroomIds),
      this.getElementCountsByVideoroom('detail_video_room_activitaties', 'da', 'da.id_videoroom', videoroomIds),
      this.getElementCountsByVideoroom('detail_evaluation_video_rooms', 'de', 'de.id_videoroom', videoroomIds),
      this.getElementCountsByVideoroom('detail_selft_evaluation_videorooms', 'ds', 'ds.id_videoroom', videoroomIds),
    ]);

    // Polls por videoroom
    const pollByVideoroom: Record<number, string> = {};
    for (const v of videorooms) {
      if (v.v_id_polls) pollByVideoroom[v.v_id] = v.v_id_polls;
    }

    // 4. Obtener progreso de polls en bulk si los hay
    const pollVideoroomIds = Object.keys(pollByVideoroom).map(Number);
    let pollProgressMap: Map<string, any[]> = new Map();
    if (pollVideoroomIds.length > 0) {
      pollProgressMap = await this.getBulkProgress(
        'user_pogress_evaluation_video_rooms', 'up',
        ['up.id_user', 'up.id_videoroom', 'up.id_evaluation', 'up.porcen', 'up.updated_at'],
        'up.id_videoroom IN (:...pollVideoroomIds) AND up.id_user IN (:...userIds)',
        { pollVideoroomIds, userIds }, startDate, adjustedEndDate,
        (r) => `${r.up_id_user}_${r.up_id_videoroom}`
      );
    }

    // 5. Agregar todo en memoria
    const result: Record<number, Record<number, any>> = {};

    for (const userId of userIds) {
      result[userId] = {};
      
      for (const v of videorooms) {
        const vid = v.v_id;
        const clubId = v.v_club_id;
        const key = `${userId}_${vid}`;
        
        let totalElements = 0;
        let totalProgressSum = 0;
        let firstDate: Date | null = null;
        let lastDate: Date | null = null;

        const updateDates = (rows: any[]) => {
          for (const row of rows) {
            const d = new Date(row.up_updated_at || row.updated_at);
            if (!firstDate || d < firstDate) firstDate = d;
            if (!lastDate || d > lastDate) lastDate = d;
          }
        };

        // Contenidos
        const cCount = contentCounts[vid] || 0;
        totalElements += cCount;
        const cRows = contentMap.get(key) || [];
        totalProgressSum += cRows.reduce((s, r) => s + (r.up_porcen || 0), 0);
        updateDates(cRows);

        // Tareas
        const tCount = taskCounts[vid] || 0;
        totalElements += tCount;
        const tRows = taskMap.get(key) || [];
        totalProgressSum += tRows.reduce((s, r) => s + (r.up_porcen || 0), 0);
        updateDates(tRows);

        // Foros
        const wCount = wallCounts[vid] || 0;
        totalElements += wCount;
        const wRows = wallMap.get(key) || [];
        totalProgressSum += wRows.reduce((s, r) => s + (r.up_porcen || 0), 0);
        updateDates(wRows);

        // Actividades
        const aCount = activityCounts[vid] || 0;
        totalElements += aCount;
        const aRows = activityMap.get(key) || [];
        totalProgressSum += aRows.reduce((s, r) => s + (r.up_porcen || 0), 0);
        updateDates(aRows);

        // Evaluaciones
        const eCount = evalCounts[vid] || 0;
        totalElements += eCount;
        const eRows = evalMap.get(key) || [];
        totalProgressSum += eRows.reduce((s, r) => s + (r.up_porcen || 0), 0);
        updateDates(eRows);

        // Autoevaluaciones
        const seCount = selfEvalCounts[vid] || 0;
        totalElements += seCount;
        const seRows = selfEvalMap.get(key) || [];
        totalProgressSum += seRows.reduce((s, r) => s + (r.up_porcen || 0), 0);
        updateDates(seRows);

        // Poll
        if (pollByVideoroom[vid]) {
          totalElements++;
          const pRows = pollProgressMap.get(key) || [];
          totalProgressSum += pRows.reduce((s, r) => s + (r.up_porcen || 0), 0);
          updateDates(pRows);
        }

        const videoroomProgress = totalElements > 0
          ? Math.min(totalProgressSum / totalElements, 100)
          : 0;

        if (!result[userId][clubId]) {
          result[userId][clubId] = {
            total_percent: 0,
            _progressSum: 0,
            unique_videorooms: 0,
            total_videorooms: clubVideoroomCount[clubId] || 0,
            progress_items: [],
            last_updated: null,
            first_started: null,
          };
        }

        const clubResult = result[userId][clubId];
        clubResult._progressSum += videoroomProgress;

        if (videoroomProgress > 0 || firstDate || lastDate) {
          clubResult.unique_videorooms++;
        }
        if (firstDate && (!clubResult.first_started || firstDate < clubResult.first_started)) {
          clubResult.first_started = firstDate;
        }
        if (lastDate && (!clubResult.last_updated || lastDate > clubResult.last_updated)) {
          clubResult.last_updated = lastDate;
        }
      }

      // Normalizar porcentaje por club
      for (const clubId of clubIds) {
        if (result[userId][clubId]) {
          const r = result[userId][clubId];
          r.total_percent = Math.max(0, Math.min(100, Math.floor(
            r._progressSum / (r.total_videorooms || 1)
          )));
          delete r._progressSum;
        }
      }
    }

    return result;
  }

  // Helper: query masiva y agrupa por clave userId_videoroomId
  private async getBulkProgress(
    table: string,
    alias: string,
    selects: string[],
    whereClause: string,
    params: Record<string, any>,
    startDate: Date | null,
    endDate: Date | null,
    keyFn: (row: any) => string
  ): Promise<Map<string, any[]>> {
    let qb = this.dataSource
      .createQueryBuilder()
      .select(selects)
      .from(table, alias)
      .where(whereClause, params);

    if (startDate) qb = qb.andWhere(`${alias}.updated_at >= :startDate`, { startDate });
    if (endDate) qb = qb.andWhere(`${alias}.updated_at <= :endDate`, { endDate });

    const rows = await qb.getRawMany();
    const map = new Map<string, any[]>();
    for (const row of rows) {
      const k = keyFn(row);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return map;
  }

  // Helper: contar elementos por videoroom
  private async getElementCountsByVideoroom(
    table: string,
    alias: string,
    videoroomColumn: string,
    videoroomIds: number[]
  ): Promise<Record<number, number>> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select([`${videoroomColumn} as vid`, 'COUNT(*) as cnt'])
      .from(table, alias)
      .where(`${videoroomColumn} IN (:...videoroomIds)`, { videoroomIds })
      .groupBy(videoroomColumn)
      .getRawMany();

    return rows.reduce((acc, r) => {
      acc[r.vid] = parseInt(r.cnt, 10);
      return acc;
    }, {});
  }

  /**
   * Obtiene el progreso de usuarios en los videorooms
   */
  private async getProgressForUsers(
    userIds: number[], 
    clubIds: number[],
    startDate?:  Date | null,
    endDate?:  Date | null
  ): Promise<Record<number, Record<number, any>>> {

    // Obtener todos los videorooms para los clubes seleccionados
    const videorooms = await this.videoRoomsRepository
      .createQueryBuilder('videoroom')
      .where('videoroom.club_id IN (:...clubIds)', { clubIds })
      .andWhere('videoroom.enable_modules = :enableModules', { enableModules: true })
      .andWhere('videoroom.public = :public', { public: true })
      .select(['videoroom.id', 'videoroom.club_id'])
      .getMany();
    
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
      let latestProgressQuery = this.progressRepository
        .createQueryBuilder('progress')
        .select('MAX(progress.id)', 'max_id')
        .where('progress.id_user IN (:...userIds)', { userIds })
        .andWhere('progress.id_videoroom IN (:...videoroomIds)', { videoroomIds });
      
      // Agregar filtro por fechas si están definidas
      if (startDate) {
        latestProgressQuery = latestProgressQuery.andWhere('progress.updated_at >= :startDate', { startDate });
        // this.logger.warn(`Aplicando filtro startDate: ${startDate.toISOString()}`);
      }
      
      if (endDate) {
        // Ajustar la fecha de fin para incluir todo el día
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setHours(23, 59, 59, 999);
        latestProgressQuery = latestProgressQuery.andWhere('progress.updated_at <= :endDate', { endDate: adjustedEndDate });
        // this.logger.warn(`Aplicando filtro endDate: ${adjustedEndDate.toISOString()}`);
      }
      
      latestProgressQuery = latestProgressQuery
        .groupBy('progress.id_user')
        .addGroupBy('progress.id_videoroom');
      
      const latestProgressIds = await latestProgressQuery.getRawMany();

      // this.logger.warn(`Últimos IDs de progreso obtenidos: ${JSON.stringify(latestProgressIds, null, 2)}`);
      
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

      // this.logger.warn(`Progreso obtenido para club ${clubId}: ${JSON.stringify(progress, null, 2)}`);
      
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
            last_updated: null,
            first_started: null
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

      // Obtener el PRIMER progreso registrado para cada combinación de usuario/videoroom
      let firstProgressQuery = this.progressRepository
        .createQueryBuilder('progress')
        .select('MIN(progress.id)', 'min_id')
        .where('progress.id_user IN (:...userIds)', { userIds })
        .andWhere('progress.id_videoroom IN (:...videoroomIds)', { videoroomIds });

      // Aplicar los mismos filtros de fecha si están definidos
      if (startDate) {
        firstProgressQuery = firstProgressQuery.andWhere('progress.updated_at >= :startDate', { startDate });
      }

      if (endDate) {
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setHours(23, 59, 59, 999);
        firstProgressQuery = firstProgressQuery.andWhere('progress.updated_at <= :endDate', { endDate: adjustedEndDate });
      }

      firstProgressQuery = firstProgressQuery
        .groupBy('progress.id_user')
        .addGroupBy('progress.id_videoroom');

      const firstProgressIds = await firstProgressQuery.getRawMany();

      if (firstProgressIds.length > 0) {
        const minIds = firstProgressIds.map(item => item.min_id);
        
        // Obtener las fechas del primer progreso
        const firstProgress = await this.progressRepository
          .createQueryBuilder('g')
          .innerJoin('videorooms', 'v', 'g.id_videoroom = v.id')
          .where('g.id IN (:...minIds)', { minIds })
          .andWhere('v.club_id = :clubId', { clubId })
          .select([
            'g.id_user', 
            'g.updated_at'
          ])
          .getRawMany();

        // Agregar la fecha de inicio al resultado
        for (const item of firstProgress) {
          const userId = item.g_id_user;
          if (result[userId] && result[userId][clubId]) {
            const firstDate = new Date(item.g_updated_at);
            if (!result[userId][clubId].first_started || firstDate < result[userId][clubId].first_started) {
              result[userId][clubId].first_started = firstDate;
            }
          }
        }
      }

      // Progreso despues de obtener los items
      // this.logger.warn(`Progreso por usuario para club ${clubId}: ${JSON.stringify(result, null, 2)}`);
      
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

    // this.logger.warn(`Progreso de usuarios obtenido: ${JSON.stringify(result, null, 2)}`);
    
    return result;
  }

  /**
   * Obtiene los datos de evaluaciones y horas de intensidad desde los clubes
   */
  private async getEvaluationDataForUsers(
    userIds: number[], 
    clubIds: number[],
    startDate?:  Date | null,
    endDate?:  Date | null
  ): Promise<any> {

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
        
        // Map evaluations by club
        const evaluationsByClub = {};
        for (const evaluation of evaluations) {
            for (const evalClub of evaluation.evaluationClubs) {
                if (!evaluationsByClub[evalClub.club_id]) {
                    evaluationsByClub[evalClub.club_id] = [];
                }
                evaluationsByClub[evalClub.club_id].push(evaluation);
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
        
        // Get evaluation results with date filter
        let evaluationUsersQuery = this.evaluationUsersRepository
            .createQueryBuilder('evaluationUser')
            .where('evaluationUser.user_id IN (:...userIds)', { userIds })
            .andWhere('evaluationUser.evaluation_id IN (:...evaluationIds)', { evaluationIds });
        
        // Agregar filtro por fechas si están definidas
        if (startDate) {
            // evaluationUsersQuery = evaluationUsersQuery.andWhere('evaluationUser.created_at >= :startDate OR evaluationUser.created_at IS NULL', { startDate });
            evaluationUsersQuery = evaluationUsersQuery.andWhere('evaluationUser.created_at >= :startDate', { startDate });
            // this.logger.warn(`Aplicando filtro startDate en evaluations: ${startDate.toISOString()}`);
        }
        
        if (endDate) {
            // Ajustar la fecha de fin para incluir todo el día
            const adjustedEndDate = new Date(endDate);
            adjustedEndDate.setHours(23, 59, 59, 999);
            // evaluationUsersQuery = evaluationUsersQuery.andWhere('evaluationUser.created_at <= :endDate OR evaluationUser.created_at IS NULL', { endDate: adjustedEndDate });
            evaluationUsersQuery = evaluationUsersQuery.andWhere('evaluationUser.created_at <= :endDate', { endDate: adjustedEndDate });
            // this.logger.warn(`Aplicando filtro endDate en evaluations: ${adjustedEndDate.toISOString()}`);
        }
        
        evaluationUsersQuery = evaluationUsersQuery
            .select(['evaluationUser.user_id', 'evaluationUser.evaluation_id', 'evaluationUser.nota', 'evaluationUser.approved']);
        
        const evaluationUsers = await evaluationUsersQuery.getMany();
        
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
        
        // For surveys, get if user has responded with date filter
        const surveyEvaluationIds = evaluations
            .filter(e => e.type === 'survey')
            .map(e => e.id);
        
        const surveyAnswers = {};
        
        if (surveyEvaluationIds.length > 0) {
            let answersQuery = this.answersRepository
                .createQueryBuilder('answer')
                .where('answer.user_id IN (:...userIds)', { userIds })
                .andWhere('answer.evaluation_id IN (:...surveyEvaluationIds)', { surveyEvaluationIds });
            
            // Agregar filtro por fechas si están definidas
            if (startDate) {
                // answersQuery = answersQuery.andWhere('answer.created_at >= :startDate OR answer.created_at IS NULL', { startDate });
                answersQuery = answersQuery.andWhere('answer.created_at >= :startDate', { startDate });
            }
            
            if (endDate) {
                // Ajustar la fecha de fin para incluir todo el día
                const adjustedEndDate = new Date(endDate);
                adjustedEndDate.setHours(23, 59, 59, 999);
                // answersQuery = answersQuery.andWhere('answer.created_at <= :endDate OR answer.created_at IS NULL', { endDate: adjustedEndDate });
                answersQuery = answersQuery.andWhere('answer.created_at <= :endDate', { endDate: adjustedEndDate });
            }
            
            answersQuery = answersQuery
                .select(['answer.user_id', 'answer.evaluation_id'])
                .distinct(true);
            
            const answers = await answersQuery.getMany();
            
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
    evaluationData: any,
    startDate?: Date,
    endDate?: Date
  ): any {
    const userData: any = {
      active_inactive: user.status_validation === '1' ? 'Activo' : 'Inactivo',
      identification: user.identification,
      name: user.name,
      last_name: user.last_name,
      email: user.email,
      role: user.charge,
      company: user.company,
    };

    // ✅ FIX 1: Precomputar Set de clubs inscritos para este usuario (O(1) lookup)
    const enrolledClubIds = new Set(
      (clubUsers[user.id] || []).map(cu => cu.club_id)
    );

    // ✅ FIX 2: Obtener resultados de evaluaciones del usuario una sola vez
    const userEvalResults = evaluationData.evaluation_results[user.id] || {};
    const userSurveyAnswers = evaluationData.survey_answers[user.id] || {};
    const isClient65 = user.client_id === 65;
    const isClient72 = user.client_id === 72;

    for (const club of clubs) {
      const isEnrolled = enrolledClubIds.has(club.id); // O(1) en vez de O(n)
      const defaultValue = isEnrolled ? 'N/ID' : 'N/A';

      userData[`club_${club.id}_percentage`] = defaultValue;
      userData[`club_${club.id}_hours`]      = defaultValue;
      userData[`club_${club.id}_start_date`] = defaultValue;
      userData[`club_${club.id}_date`]       = defaultValue;
      userData[`club_${club.id}_score`]      = defaultValue;
      userData[`club_${club.id}_certified`]  = isEnrolled ? 'No' : 'N/A';

      if (!isEnrolled) continue; // Evitar anidar todo lo demás

      // Progreso
      const progress = userProgress[user.id]?.[club.id];
      if (progress) {
        userData[`club_${club.id}_start_date`] = progress.first_started || 'N/ID';
        userData[`club_${club.id}_date`]       = progress.last_updated;
        userData[`club_${club.id}_percentage`] = `${Math.round(progress.total_percent)} %`;
      }

      // Evaluaciones
      const clubEvaluations = evaluationData.evaluations_by_club[club.id];
      if (!clubEvaluations?.length) continue;

      userData[`club_${club.id}_hours`] = evaluationData.club_hours[club.id] || 0;

      let isCertified = false;
      let bestScore: number | null = null;
      let hasAnyEvaluation = false;

      for (const evaluation of clubEvaluations) {
        if (evaluation.type === 'survey') {
          // ✅ FIX 3: Lookup directo O(1) en lugar de recorrer el objeto
          if (userSurveyAnswers[evaluation.id]) {
            isCertified = true;
            bestScore = 100;
            hasAnyEvaluation = true;
          }
        } else {
          // ✅ FIX 2: Acceso directo por ID, no loop sobre todas las evaluaciones
          const result = userEvalResults[evaluation.id];
          if (!result) continue;

          hasAnyEvaluation = true;
          if (result.approved === 1) {
            isCertified = true;
            bestScore = result.nota;
          } else if (bestScore === null || result.nota > bestScore) {
            bestScore = result.nota;
          }
        }
      }

      userData[`club_${club.id}_score`]     = hasAnyEvaluation ? bestScore : 'Sin Realizar';
      userData[`club_${club.id}_certified`] = isCertified ? 'Si' : 'No';

      // Lógica especial client 65 o client 72: si el progreso es mayor a 80% pero no está certificado, mostrar 79%
      if ((isClient65 || isClient72) && !isCertified) {
        const pct = parseInt(String(userData[`club_${club.id}_percentage`]).replace('%', '').trim());
        if (!isNaN(pct) && pct > 80) {
          userData[`club_${club.id}_percentage`] = '79 %';
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
    // Directorio para reportes
    const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
    const reportsDir = path.join(uploadsDir, 'reports/course-status');
    
    // Crear directorio si no existe
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Cambiar extensión a .xlsx
    const excelFileName = fileName.replace('.csv', '.xlsx');
    const filePath = path.join(reportsDir, excelFileName);
    
    // Crear nuevo workbook
    const workbook = XLSX.utils.book_new();
    
    // Preparar datos para la hoja
    const worksheetData = this.prepareExcelData(clubs, reportData);
    
    // Crear worksheet con los datos
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData.data);
    
    // Aplicar merges (celdas combinadas)
    worksheet['!merges'] = worksheetData.merges;
    
    // Configurar anchos de columna
    worksheet['!cols'] = worksheetData.columnWidths;
    
    // Configurar márgenes
    worksheet['!margins'] = {
        left: 0.7,
        right: 0.7,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3
    };
    
    // Agregar la hoja al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Estado Cursos');
    
    // Escribir el archivo
    XLSX.writeFile(workbook, filePath);
    
    return filePath;
  }


  private prepareExcelData(clubs: Club[], reportData: any[]): {
      data: any[][],
      merges: XLSX.Range[],
      columnWidths: XLSX.ColInfo[]
  } {
      const data: any[][] = [];
      const merges: XLSX.Range[] = [];
      
      // Encabezados estáticos
      const staticHeaders = [
          'Estatus', 'Identificación', 'Nombre', 'Apellido', 
          'Email', 'Cargo', 'Empresa'
      ];
      
      // Preparar primera fila de encabezados (con nombres de clubes)
      const headerRow1: any[] = [...staticHeaders];
      
      // Preparar segunda fila de encabezados (con subencabezados)
      const headerRow2: any[] = ['', '', '', '', '', '', ''];
      
      let currentCol = staticHeaders.length;
      
      // Agregar encabezados dinámicos para cada club
      for (const club of clubs) {
          const translation = club.clubTranslation?.find(t => t.locale === 'es');
          const clubName = translation?.title || `Club ${club.id}`;
          
          // Agregar nombre del club en la primera fila (se expandirá con merge)
          headerRow1.push(clubName);
          headerRow1.push('', '', '', ''); // Espacios vacíos para el merge
          
          // Agregar subencabezados en la segunda fila
          headerRow2.push('Progreso', 'Horas', 'Fecha', 'Nota', 'Certificado');
          
          // Definir merge para el nombre del club (5 columnas)
          merges.push({
              s: { c: currentCol, r: 0 }, // Start
              e: { c: currentCol + 4, r: 0 } // End (5 columnas)
          });
          
          currentCol += 5;
      }
      
      // Agregar merges verticales para las columnas estáticas
      for (let i = 0; i < staticHeaders.length; i++) {
          merges.push({
              s: { c: i, r: 0 },
              e: { c: i, r: 1 }
          });
      }
      
      // Agregar las filas de encabezados
      data.push(headerRow1);
      data.push(headerRow2);
      
      // Procesar datos de usuarios
      for (const userData of reportData) {
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
              // Formatear progreso como porcentaje
              const percentage = userData[`club_${club.id}_percentage`] || 0;
              const progressValue = percentage;
              
              // Formatear la fecha
              const dateValue = userData[`club_${club.id}_date`];
              let formattedDate: Date | string = '';
              
              if (dateValue) {
                  if (dateValue instanceof Date) {
                      formattedDate = dateValue;
                  } else if (typeof dateValue === 'string' && dateValue.trim() !== '') {
                      const parsedDate = new Date(dateValue);
                      if (!isNaN(parsedDate.getTime())) {
                          formattedDate = parsedDate;
                      } else {
                          formattedDate = dateValue;
                      }
                  }
              }
              
              // Agregar cada columna para este club
              rowValues.push(
                  progressValue, // Excel manejará el formato de porcentaje
                  userData[`club_${club.id}_hours`] || '',
                  formattedDate,
                  userData[`club_${club.id}_score`] || '',
                  userData[`club_${club.id}_certified`] || ''
              );
          }
          
          data.push(rowValues);
      }
      
      // Configurar anchos de columna
      const columnWidths: XLSX.ColInfo[] = [
          { width: 12 }, // Estatus
          { width: 15 }, // Identificación
          { width: 20 }, // Nombre
          { width: 20 }, // Apellido
          { width: 25 }, // Email
          { width: 20 }, // Cargo
          { width: 20 }, // Empresa
      ];
      
      // Agregar anchos para columnas de clubes
      for (const club of clubs) {
          columnWidths.push(
              { width: 12 }, // Progreso
              { width: 10 }, // Horas
              { width: 15 }, // Fecha
              { width: 12 }, // Nota
              { width: 12 }  // Certificado
          );
      }
      
      return {
          data,
          merges,
          columnWidths
      };
  }

  // private formatDateForExcel(date: Date): Date {
  //     // Excel maneja las fechas de forma nativa cuando se pasa un objeto Date
  //     return date;
  // }

  private formatDateSafe(dateValue: any): string {
    if (!dateValue) return '';
    
    let date: Date;
    
    // Si ya es una instancia de Date
    if (dateValue instanceof Date) {
        date = dateValue;
    }
    // Si es un string, intentar parsearlo
    else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
    }
    // Si es otro tipo, intentar convertirlo
    else {
        date = new Date(dateValue);
    }
    
    // Verificar que la fecha sea válida
    if (isNaN(date.getTime())) {
        return dateValue.toString();
    }
    
    // Formato ISO: YYYY-MM-DD (Excel lo reconoce mejor)
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

    

    // 3. Método para escribir CSV organizado por usuario (lógica actual)
    private async writeCSVByUser(
        writeStream: fs.WriteStream,
        clubs: Club[],
        reportData: any[],
        customFields: CustomField[],
        clientId: number
    ): Promise<void> {
        // Definir encabezados estáticos
        const staticHeaders = [
            'Estatus', 'Identificación', 'Nombre', 'Apellido', 
            'Email', 'Cargo', 'Empresa'
        ];

        // Agregar encabezados de custom fields
        const customFieldHeaders = customFields.map(cf => cf.name);
        
        // Preparar encabezados dinámicos para los clubes
        const dynamicHeaders: any[] = [];
        for (const club of clubs) {
          const translation = club.clubTranslation?.find(t => t.locale === 'es');
          const clubName = translation?.title || `Club ${club.id}`;
          
          // MODIFICAR headers según clientId
          if (clientId === 65) {
            dynamicHeaders.push(clubName, 'Horas', 'Fecha Inicial', 'Fecha Final', 'Nota', 'Certificado');
          } else {
            dynamicHeaders.push(clubName, 'Horas', 'Fecha', 'Nota', 'Certificado');
          }
        }
        
        const allHeaders = [...staticHeaders, ...customFieldHeaders, ...dynamicHeaders];
        const escapedHeaders = allHeaders.map(header => this.escapeCSV(header));
        writeStream.write(escapedHeaders.join(',') + '\n');
        
        // Procesar y escribir datos fila por fila
        for (const userData of reportData) {
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

            // Agregar valores de custom fields
            for (const cf of customFields) {
                rowValues.push(userData[`custom_field_${cf.id}`] || '');
            }
            
            // Agregar datos de clubes
            for (const club of clubs) {

              // CONDICIONAL para Fecha Inicial (solo para cliente 65)
              if (clientId === 65) {
                const startDateValue = userData[`club_${club.id}_start_date`];
                let formattedStartDate: Date | string = '';
                if (startDateValue) {
                  if (startDateValue instanceof Date) {
                    formattedStartDate = this.formatDateForExcel(startDateValue);
                  } else if (typeof startDateValue === 'string' && startDateValue.trim() !== '') {
                    const parsedDate = new Date(startDateValue);
                    if (!isNaN(parsedDate.getTime())) {
                        formattedStartDate = this.formatDateForExcel(parsedDate);
                    } else {
                        formattedStartDate = startDateValue;
                    }
                  }
                }
                rowValues.push(
                  userData[`club_${club.id}_percentage`] || '',
                  userData[`club_${club.id}_hours`] || '',
                  formattedStartDate
                );
              } else {
                rowValues.push(
                  userData[`club_${club.id}_percentage`] || '',
                  userData[`club_${club.id}_hours`] || ''
                );
              }

                const dateValue = userData[`club_${club.id}_date`];
                let formattedDate: Date | string = '';
                
                if (dateValue) {
                    if (dateValue instanceof Date) {
                        formattedDate = this.formatDateForExcel(dateValue);
                    } else if (typeof dateValue === 'string' && dateValue.trim() !== '') {
                        const parsedDate = new Date(dateValue);
                        if (!isNaN(parsedDate.getTime())) {
                            formattedDate = this.formatDateForExcel(parsedDate);
                        } else {
                            formattedDate = dateValue;
                        }
                    }
                }
                
              rowValues.push(
                formattedDate,
                userData[`club_${club.id}_score`] || '',
                userData[`club_${club.id}_certified`] || ''
              );
            }
            
            const escapedRowValues = rowValues.map(value => this.escapeCSV(value));
            writeStream.write(escapedRowValues.join(',') + '\n');
        }
    }

    // 4. Método NUEVO para escribir CSV organizado por curso
    private async writeCSVByCourse(
        writeStream: fs.WriteStream,
        clubs: Club[],
        reportData: any[],
        customFields: CustomField[],
        clientId: number
    ): Promise<void> {
        // Definir encabezados
        const staticHeaders = [
          'Estatus', 'Identificación', 'Nombre', 'Apellido', 
          'Email', 'Cargo', 'Empresa'
        ];

        // Agregar encabezados de custom fields
        const customFieldHeaders = customFields.map(cf => cf.name);

        // Encabezados de curso
        const courseHeaders = clientId === 65 
        ? ['Nombre del Curso', 'Porcentaje', 'Horas', 'Fecha Inicial', 'Fecha Final', 'Nota', 'Certificado']
        : ['Nombre del Curso', 'Porcentaje', 'Horas', 'Fecha', 'Nota', 'Certificado'];
        
        const headers = [...staticHeaders, ...customFieldHeaders, ...courseHeaders];
        const escapedHeaders = headers.map(header => this.escapeCSV(header));
        writeStream.write(escapedHeaders.join(',') + '\n');
        
        // Procesar datos: una fila por cada combinación usuario-curso
        for (const userData of reportData) {
            // Por cada club/curso, crear una fila
            for (const club of clubs) {
                const rowValues: any[] = [];
                
                // Agregar datos estáticos del usuario
                rowValues.push(
                    userData.active_inactive || '',
                    userData.identification || '',
                    userData.name || '',
                    userData.last_name || '',
                    userData.email || '',
                    userData.role || '',
                    userData.company || ''
                );

                // Agregar valores de custom fields
                for (const cf of customFields) {
                  rowValues.push(userData[`custom_field_${cf.id}`] || '');
                }
                
                // Agregar nombre del curso
                const translation = club.clubTranslation?.find(t => t.locale === 'es');
                const clubName = translation?.title || `Club ${club.id}`;
                rowValues.push(clubName);

                if (clientId === 65) {
                  const startDateValue = userData[`club_${club.id}_start_date`];
                  let formattedStartDate: Date | string = '';
                  if (startDateValue) {
                      if (startDateValue instanceof Date) {
                          formattedStartDate = this.formatDateForExcel(startDateValue);
                      } else if (typeof startDateValue === 'string' && startDateValue.trim() !== '') {
                          const parsedDate = new Date(startDateValue);
                          if (!isNaN(parsedDate.getTime())) {
                              formattedStartDate = this.formatDateForExcel(parsedDate);
                          } else {
                              formattedStartDate = startDateValue;
                          }
                      }
                  }
                  rowValues.push(
                      userData[`club_${club.id}_percentage`] || '',
                      userData[`club_${club.id}_hours`] || '',
                      formattedStartDate
                  );
                } else {
                  rowValues.push(
                      userData[`club_${club.id}_percentage`] || '',
                      userData[`club_${club.id}_hours`] || ''
                  );
                }
                
                // Agregar datos específicos del curso para este usuario
                const dateValue = userData[`club_${club.id}_date`];
                let formattedDate: Date | string = '';
                
                if (dateValue) {
                    if (dateValue instanceof Date) {
                        formattedDate = this.formatDateForExcel(dateValue);
                    } else if (typeof dateValue === 'string' && dateValue.trim() !== '') {
                        const parsedDate = new Date(dateValue);
                        if (!isNaN(parsedDate.getTime())) {
                            formattedDate = this.formatDateForExcel(parsedDate);
                        } else {
                            formattedDate = dateValue;
                        }
                    }
                }
                
                rowValues.push(
                  formattedDate,
                  userData[`club_${club.id}_score`] || '',
                  userData[`club_${club.id}_certified`] || ''
                );
                
                const escapedRowValues = rowValues.map(value => this.escapeCSV(value));
                writeStream.write(escapedRowValues.join(',') + '\n');
            }
        }
    }

    // private formatDateForExcel(date: Date): string {
    //     if (!date || isNaN(date.getTime())) {
    //         return '';
    //     }
        
    //     const year = date.getFullYear();
    //     const month = (date.getMonth() + 1).toString().padStart(2, '0');
    //     const day = date.getDate().toString().padStart(2, '0');
        
    //     return `${year}-${month}-${day}`; // Formato ISO 8601
    // }

    // private formatDateForExcel(date: Date): string {
    //     // Verificar que la fecha sea válida
    //     if (!date || isNaN(date.getTime())) {
    //         return '';
    //     }
        
    //     const day = date.getDate().toString().padStart(2, '0');
    //     const month = (date.getMonth() + 1).toString().padStart(2, '0'); // getMonth() retorna 0-11
    //     const year = date.getFullYear();
        
    //     // Formato DD/MM/YYYY - compatible con Excel en la mayoría de configuraciones
    //     return `${day}/${month}/${year}`;
        
    //     // Alternativa: Formato YYYY-MM-DD (ISO) - muy compatible con Excel
    //     // return `${year}-${month}-${day}`;
        
    //     // Alternativa: Formato MM/DD/YYYY (americano)
    //     // return `${month}/${day}/${year}`;
    // }


    private formatDateForExcel(date: Date): string {
      // Verificar que la fecha sea válida
      if (!date || isNaN(date.getTime())) {
          return '';
      }
      
      // Opción 1: Usar toLocaleString para convertir a hora de Colombia
      const colombiaDate = new Date(date.toLocaleString('en-US', { 
          timeZone: 'America/Bogota' 
      }));
      
      const day = colombiaDate.getDate().toString().padStart(2, '0');
      const month = (colombiaDate.getMonth() + 1).toString().padStart(2, '0');
      const year = colombiaDate.getFullYear();
      const hours = colombiaDate.getHours().toString().padStart(2, '0');
      const minutes = colombiaDate.getMinutes().toString().padStart(2, '0');
      const seconds = colombiaDate.getSeconds().toString().padStart(2, '0');
      
      return `${day}/${month}/${year}`;
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
    const workbook = new Excel.stream.xlsx.WorkbookWriter({
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

      // Agregamos el nombre del club solo en la primera celda, las otras quedan vacías para la fusión
      headerLine1.push(clubName);
      headerLine1.push('', '', '', ''); // 4 celdas vacías más para completar las 5 columnas
    }

    // Encabezados línea 2 (subcampos)
    const headerLine2: string[] = Array(staticHeaders.length).fill('');
    for (const _ of clubs) {
      headerLine2.push('Porcentaje', 'Horas', 'Fecha', 'Nota', 'Certificado');
    }

    // IMPORTANTE: Configurar las celdas fusionadas ANTES de escribir las filas
    let columnIndex = staticHeaders.length + 1; // Comenzamos después de los encabezados estáticos (1-based en ExcelJS)
    for (const _ of clubs) {
      worksheet.mergeCells(1, columnIndex, 1, columnIndex + 4); // (fila, col, fila, col)
      columnIndex += 5;
    }

    // Escribir primera línea de encabezados
    const row1 = worksheet.addRow(headerLine1);
    
    // Aplicar estilos a la primera fila ANTES de hacer commit
    row1.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' } // Gris claro
      };
    });
    
    row1.commit();
    
    // Escribir segunda línea de encabezados
    const row2 = worksheet.addRow(headerLine2);
    
    // Aplicar estilos a la segunda fila ANTES de hacer commit
    row2.eachCell((cell, colNumber) => {
      if (colNumber > staticHeaders.length) { // Solo los subencabezados de clubes
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
      }
    });
    
    row2.commit();
    
    // Configurar ancho de columnas
    staticHeaders.forEach((_, index) => {
      const column = worksheet.getColumn(index + 1);
      column.width = 15; // Ancho fijo para columnas estáticas
    });
    
    // Configurar ancho para columnas de clubes
    for (let i = staticHeaders.length + 1; i <= staticHeaders.length + (clubs.length * 5); i++) {
      const column = worksheet.getColumn(i);
      column.width = 12; // Ancho para columnas de clubes
    }
    
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
            formattedDate = String(date);
          }
          
          // Asegurar que los valores no sean undefined y convertir a string apropiado
          const percentage = userData[`club_${club.id}_percentage`];
          const hours = userData[`club_${club.id}_hours`];
          const score = userData[`club_${club.id}_score`];
          const certified = userData[`club_${club.id}_certified`];
          
          rowValues.push(
            percentage !== undefined && percentage !== null ? percentage : '',
            hours !== undefined && hours !== null ? hours : '',
            formattedDate,
            score !== undefined && score !== null ? score : '',
            certified !== undefined && certified !== null ? certified : ''
          );
        }
        
        // Escribir la fila y hacer commit inmediatamente
        const dataRow = worksheet.addRow(rowValues);
        dataRow.commit();
      }
      
      // Reportar progreso
      console.log(`Procesados ${Math.min(i + BATCH_SIZE, reportData.length)} de ${reportData.length} usuarios`);
    }

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
    reportData: any[],
    customFields: CustomField[],
    orderBy: 'user' | 'course' = 'user',
    clientId: number
  ): Promise<string> {
    // Primero creamos el CSV (reutilizando tu función existente)
    const csvPath = await this.createCSVFile(fileName, clubs, reportData, customFields, orderBy, clientId);
    
    // Luego convertimos el CSV a Excel (con formato)
    const excelFileName = fileName.replace('.csv', '.xlsx');
    const excelPath = path.join(path.dirname(csvPath), excelFileName);
    
    // Crear workbook
    const workbook = new Excel.Workbook();
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
    // Crear fecha con zona horaria de Bogotá
    const bogotaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));

    const notification = this.notificationsRepository.create({
        user_id: userId,
        title,
        message,
        type,
        data,
        read: false,
        created_at: bogotaDate,
        updated_at: bogotaDate
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
    // Crear fecha con zona horaria de Bogotá
    const bogotaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));

    await this.notificationsRepository.update(notificationId, {
      title,
      message,
      type,
      data,
      read,
      updated_at: bogotaDate
    });
  }
}