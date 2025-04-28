// user-status.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserStatusData, UserStatusFilters, UserData } from '../interfaces/user-status.interface';

@Injectable()
export class UserStatusService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async getClubsOnly(clubId?: number, searchCourse?: string, clientid?: number): Promise<any[]> {
    return this.getClubs(clubId, searchCourse, clientid);
  }

  async getUserStatusData(filters: UserStatusFilters): Promise<UserStatusData> {
    const {
      startDate,
      endDate,
      clubId,
      searchCourse,
      clientid,
      searchUser,
      searchEmail,
      searchIdentification,
      page = 1, 
      pageSize,
    } = filters;
  
    console.log('Filtros recibidos:', filters);
  
    try {
      // Validar que tenemos clientid
      if (!clientid) {
        console.warn('No se proporcionó ID de cliente. Es requerido para obtener datos correctos.');
      }
  
      // Paso 1: Obtener los clubes según los filtros
      const clubs = await this.getClubs(clubId, searchCourse, clientid);
      console.log(`Clubes encontrados: ${clubs.length}`);
  
      if (!clubs.length) {
        console.warn('No se encontraron clubes con los filtros proporcionados');
        return {
          clubs: [],
          users: [],
          userData: {},
        };
      }
  
      // Paso 2: Obtener los usuarios del cliente con paginación
      const users = await this.getUsers(
        startDate,
        endDate,
        clubId,
        clientid,
        searchUser,
        searchEmail,
        searchIdentification,
        page,
        pageSize,
      );
  
      console.log(`Total de usuarios encontrados en página ${page}: ${users.length}`);
  
      if (!users.length) {
        console.warn('No se encontraron usuarios con los filtros proporcionados');
        return {
          clubs,
          users: [],
          userData: {},
        };
      }
  
      // Paso 3: Extraer IDs (validamos que no sean undefined)
      const userIds = users.map(user => user.u_id).filter(id => id !== undefined);
      const clubIds = clubs.map(club => club.c_id).filter(id => id !== undefined);
  
      console.log(`Procesando ${userIds.length} usuarios y ${clubIds.length} clubes`);
  
      if (!userIds.length || !clubIds.length) {
        console.warn('IDs de usuarios o clubes vacíos después de filtrar valores undefined');
        return {
          clubs,
          users,
          userData: {},
        };
      }
  
      // Usar Promise.all para paralelizar las consultas pesadas
      const [userProgress, evaluationData, clubUsers] = await Promise.all([
        // Paso 4: Obtener los datos de progreso para los usuarios y clubes
        this.getProgressForUsers(userIds, clubIds),
        
        // Paso 5: Obtener datos de evaluaciones
        this.getEvaluationDataForUsers(userIds, clubIds),
        
        // Paso 6: Obtener inscripciones de usuarios a clubes
        this.getClubUsers(userIds, clubIds)
      ]);
  
      // Paso 7: Procesar datos de cada usuario
      const userData: Record<number, UserData> = {};
      
      console.log('Procesando datos de usuario...');
      
      for (const user of users) {
        if (user.u_id !== undefined) {
          userData[user.u_id] = this.processUserData(
            user,
            clubs,
            clubUsers,
            userProgress,
            evaluationData,
          );
        }
      }
  
      console.log(`Datos procesados para ${Object.keys(userData).length} usuarios`);
      
      return {
        clubs,
        users,
        userData,
      };
    } catch (error) {
      console.error('Error processing user status data:', error);
      throw error;
    }
  }
  

  private async getClubs(clubId?: number, searchCourse?: string, clientid?: number): Promise<any[]> {
    let query = this.dataSource
      .createQueryBuilder()
      .select([
        'c.id as c_id',
        'ct.title as ct_title',
      ])
      .from('clubs', 'c');
  
    // Aplicamos el filtro de cliente como una condición separada
    if (clientid) {
      query = query.andWhere('c.client_id = :clientid', { clientid });
    }
  
    query = query.leftJoin('club_translations', 'ct', 'c.id = ct.club_id AND ct.locale = :locale', {
      locale: process.env.DEFAULT_LOCALE || 'es',
    });
  
    if (clubId) {
      query = query.andWhere('c.id = :clubId', { clubId });
    }
  
    if (searchCourse) {
      query = query.andWhere('ct.title LIKE :search', { search: `%${searchCourse}%` });
    }
  
    console.log('Club query SQL:', query.getSql());
    console.log('Club query params:', { clientid, clubId, searchCourse });
  
    return query.getRawMany();
  }

  private async getUsers(
    startDate: string,
    endDate: string,
    clubId?: number,
    clientid?: number,
    searchUser?: string,
    searchEmail?: string,
    searchIdentification?: string,
    page: number = 1,
    pageSize?: number,
  ): Promise<any[]> {
    // Construir la consulta base con selección de usuarios únicos
    let query = this.dataSource
      .createQueryBuilder()
      .select([
        'u.id as u_id',
        'u.name as u_name',
        'u.last_name as u_last_name',
        'u.email as u_email',
        'u.identification as u_identification',
        'u.charge',
        'u.company',
        'u.status_validation',
      ])
      .from('users', 'u')
      .distinct(true);
    
    // Aplicar filtro de cliente como condición primaria (siempre debe aplicarse)
    if (clientid) {
      query = query.where('u.client_id = :clientid', { clientid });
      console.log(`Filtrando por cliente ID: ${clientid}`);
    } else {
      console.log('ADVERTENCIA: No se está filtrando por ID de cliente');
    }
  
    // Crear una subquery para los filtros adicionales solo si se especifican
    let hasAdditionalFilters = false;
    
    // Si hay un club_id específico, filtramos por club
    if (clubId) {
      query = query
        .innerJoin('club_user', 'cu', 'u.id = cu.user_id')
        .andWhere('cu.club_id = :clubId', { clubId });
      hasAdditionalFilters = true;
    }
  
    // Filtros de fechas solo si ambas fechas están presentes
    if (startDate && endDate && startDate !== 'undefined' && endDate !== 'undefined') {
      // El filtro de fechas ahora es opcional, comentado por defecto
      /*
      query = query
        .leftJoin(
          'general_pogress_video_rooms',
          'gp',
          'u.id = gp.id_user'
        )
        .andWhere('gp.updated_at BETWEEN :startDate AND :endDate', {
          startDate,
          endDate,
        });
      hasAdditionalFilters = true;
      */
    }
  
    // Filtros de búsqueda por texto
    if (searchUser && searchUser !== 'undefined') {
      query = query.andWhere(
        '(u.name LIKE :searchUser OR u.last_name LIKE :searchUser)',
        { searchUser: `%${searchUser}%` }
      );
      hasAdditionalFilters = true;
    }
  
    if (searchEmail && searchEmail !== 'undefined') {
      query = query.andWhere('u.email LIKE :searchEmail', {
        searchEmail: `%${searchEmail}%`,
      });
      hasAdditionalFilters = true;
    }
  
    if (searchIdentification && searchIdentification !== 'undefined') {
      query = query.andWhere('u.identification LIKE :searchIdentification', {
        searchIdentification: `%${searchIdentification}%`,
      });
      hasAdditionalFilters = true;
    }
  
    // Aplicar paginación si se especifica un tamaño de página
    if (pageSize && pageSize > 0) {
      const skip = (page - 1) * pageSize;
      console.log(`Aplicando paginación: página ${page}, tamaño ${pageSize}, skip ${skip}`);
      query = query.skip(skip).take(pageSize);
    } else {
      // Si no hay tamaño de página específico pero hay paginación, usar un valor por defecto
      if (page > 1) {
        const defaultSize = 200;
        const skip = (page - 1) * defaultSize;
        console.log(`Aplicando paginación por defecto: página ${page}, tamaño ${defaultSize}, skip ${skip}`);
        query = query.skip(skip).take(defaultSize);
      }
    }
  
    // Ordenar por nombre para tener un orden consistente
    query = query.orderBy('u.name', 'ASC');
  
    // Imprimir la consulta SQL generada para depuración
    const sqlQuery = query.getSql();
    const params = query.getParameters();
    console.log('SQL Query:', sqlQuery);
    console.log('Query Parameters:', params);
    
    try {
      const users = await query.getRawMany();
      console.log(`Usuarios encontrados en página ${page}: ${users.length}`);
      return users;
    } catch (error) {
      console.error('Error ejecutando consulta de usuarios:', error);
      throw error;
    }
  }

  private async getClubUsers(userIds: number[], clubIds: number[]): Promise<Record<number, any[]>> {
    // Si alguno de los arrays está vacío, devolver un objeto vacío
    if (!userIds.length || !clubIds.length) {
      return {};
    }
  
    try {
      const clubUsersQuery = this.dataSource
        .createQueryBuilder()
        .select([
          'cu.user_id', 
          'cu.club_id'
        ])
        .from('club_user', 'cu')
        .where('cu.user_id IN (:...userIds)', { userIds })
        .andWhere('cu.club_id IN (:...clubIds)', { clubIds });
  
      const clubUsers = await clubUsersQuery.getRawMany();
      console.log(`Club users found: ${clubUsers.length}`);
      
      // Agrupar por usuario para facilitar el procesamiento
      const groupedByUser: Record<number, any[]> = {};
      
      for (const clubUser of clubUsers) {
        if (!groupedByUser[clubUser.user_id]) {
          groupedByUser[clubUser.user_id] = [];
        }
        groupedByUser[clubUser.user_id].push(clubUser);
      }
      
      return groupedByUser;
    } catch (error) {
      console.error('Error getting club users:', error);
      return {};
    }
  }

  private async getProgressForUsers(userIds: number[], clubIds: number[]): Promise<Record<number, Record<number, any>>> {
    // Resultado final
    const result: Record<number, Record<number, any>> = {};
    
    // Validar arrays de entrada
    if (!userIds.length || !clubIds.length) {
      return result;
    }
    
    // 1. Primero, obtenemos todos los videorooms para los clubes
    const videorooms = await this.dataSource
      .createQueryBuilder()
      .select(['id', 'club_id'])
      .from('videorooms', 'v')
      .where('v.club_id IN (:...clubIds)', { clubIds })
      .andWhere('v.enable_modules = 1')
      .andWhere('v.public = 1')
      .getRawMany();
    
    // Si no hay videorooms, devolver temprano
    if (!videorooms.length) {
      return result;
    }
    
    // 2. Agrupar videorooms por club
    const videoroomCounts: Record<number, number> = {};
    const videoroomsByClub: Record<number, number[]> = {};
    
    for (const videoroom of videorooms) {
      const clubId = videoroom.club_id;
      if (!videoroomCounts[clubId]) {
        videoroomCounts[clubId] = 0;
        videoroomsByClub[clubId] = [];
      }
      videoroomCounts[clubId]++;
      videoroomsByClub[clubId].push(videoroom.id);
    }
    
    // 3. Procesar cada club por separado
    for (const clubId of clubIds) {
      if (!videoroomsByClub[clubId] || videoroomsByClub[clubId].length === 0) {
        continue; // Sin videorooms para este club
      }
      
      const videoroomIds = videoroomsByClub[clubId];
      
      // Obtenemos el progreso usando subconsulta para el último registro
      const progressQuery = `
        SELECT g.id, g.id_user, g.id_videoroom, g.porcen, g.updated_at, v.club_id
        FROM general_pogress_video_rooms g
        JOIN videorooms v ON g.id_videoroom = v.id
        JOIN (
          SELECT MAX(g1.id) as max_id
          FROM general_pogress_video_rooms g1
          WHERE g1.id_user IN (?) AND g1.id_videoroom IN (?)
          GROUP BY g1.id_user, g1.id_videoroom
        ) latest ON g.id = latest.max_id
        WHERE v.club_id = ?
      `;
      
      const progress = await this.dataSource.query(
        progressQuery,
        [userIds, videoroomIds, clubId]
      );
      
      // Organizar por usuario
      for (const item of progress) {
        const userId = item.id_user;
        
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
        
        // Actualizar fecha de última actividad
        const itemDate = new Date(item.updated_at);
        if (!result[userId][clubId].last_updated || 
            itemDate > new Date(result[userId][clubId].last_updated)) {
          result[userId][clubId].last_updated = item.updated_at;
        }
      }
      
      // Calcular porcentajes totales
      for (const userId in result) {
        if (result[userId][clubId]) {
          // Calcular videorooms únicos con progreso
          const uniqueVideorooms = new Set(
            result[userId][clubId].progress_items.map(item => item.id_videoroom)
          ).size;
          
          // Calcular porcentaje total
          let totalPercent = 0;
          if (videoroomCounts[clubId] > 0) {
            totalPercent = result[userId][clubId].progress_items
              .reduce((sum, item) => sum + item.porcen, 0);
            
            // Normalizar al rango 0-100
            totalPercent = Math.round(totalPercent / videoroomCounts[clubId]);
            
            // Asegurar rango válido
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

  private async getEvaluationDataForUsers(userIds: number[], clubIds: number[]): Promise<any> {
    // Valores por defecto en caso de arrays vacíos
    if (!userIds.length || !clubIds.length) {
      return {
        evaluations_by_club: {},
        evaluation_results: {},
        certificates: {},
        survey_answers: {}
      };
    }
  
    // 1. Obtener evaluaciones para los clubes seleccionados
    const evaluationClubsQuery = `
      SELECT ec.id, ec.evaluation_id, ec.club_id, e.type, e.approving_note
      FROM evaluation_clubs ec
      JOIN evaluations e ON e.id = ec.evaluation_id
      WHERE ec.club_id IN (?) AND e.enable_certificate = 1
    `;
    
    const evaluationClubs = await this.dataSource.query(evaluationClubsQuery, [clubIds]);
    
    // Mapear evaluaciones por club
    const evaluationsByClub: Record<number, any> = {};
    const evaluationIds: number[] = [];
    
    for (const evalClub of evaluationClubs) {
      evaluationsByClub[evalClub.club_id] = {
        id: evalClub.evaluation_id,
        type: evalClub.type,
        approving_note: evalClub.approving_note
      };
      evaluationIds.push(evalClub.evaluation_id);
    }
    
    // Si no hay evaluaciones, devolver temprano
    if (!evaluationIds.length) {
      return {
        evaluations_by_club: evaluationsByClub,
        evaluation_results: {},
        certificates: {},
        survey_answers: {}
      };
    }
    
    // 2. Obtener resultados de evaluaciones
    const evaluationUsersQuery = `
      SELECT user_id, evaluation_id, nota, approved
      FROM evaluation_users
      WHERE user_id IN (?) AND evaluation_id IN (?)
    `;
    
    const evaluationResults = await this.dataSource.query(
      evaluationUsersQuery,
      [userIds, evaluationIds]
    );
    
    // 3. Obtener certificados (para horas)
    const certificatesQuery = `
      SELECT evaluation_id, hours
      FROM certificates
      WHERE evaluation_id IN (?)
    `;
    
    const certificatesData = await this.dataSource.query(certificatesQuery, [evaluationIds]);
    
    // Transformar a formato de clave-valor
    const certificates: Record<number, any> = {};
    for (const cert of certificatesData) {
      certificates[cert.evaluation_id] = cert;
    }
    
    // 4. Para encuestas, obtener respuestas
    const surveyEvaluationIds = evaluationClubs
      .filter(ec => ec.type === 'survey')
      .map(ec => ec.evaluation_id);
    
    const surveyAnswers: Record<number, Record<number, boolean>> = {};
    
    if (surveyEvaluationIds.length > 0) {
      const answersQuery = `
        SELECT DISTINCT user_id, evaluation_id
        FROM answers
        WHERE user_id IN (?) AND evaluation_id IN (?)
      `;
      
      const answers = await this.dataSource.query(
        answersQuery,
        [userIds, surveyEvaluationIds]
      );
      
      for (const answer of answers) {
        if (!surveyAnswers[answer.user_id]) {
          surveyAnswers[answer.user_id] = {};
        }
        surveyAnswers[answer.user_id][answer.evaluation_id] = true;
      }
    }
    
    // 5. Organizar resultados por usuario y evaluación
    const evaluationResultsByUser: Record<number, Record<number, any>> = {};
    
    for (const result of evaluationResults) {
      if (!evaluationResultsByUser[result.user_id]) {
        evaluationResultsByUser[result.user_id] = {};
      }
      evaluationResultsByUser[result.user_id][result.evaluation_id] = result;
    }
    
    return {
      evaluations_by_club: evaluationsByClub,
      evaluation_results: evaluationResultsByUser,
      certificates: certificates,
      survey_answers: surveyAnswers
    };
  }

  private processUserData(
    user: any,
    clubs: any[],
    clubUsers: Record<number, any[]>,
    userProgress: Record<number, Record<number, any>>,
    evaluationData: any
  ): UserData {
    const active = user.status_validation ? 'Activo' : 'Inactivo';
  
    const userData: UserData = {
      active_inactive: active,
      identification: user.u_identification,
      name: user.u_name,
      last_name: user.u_last_name,
      email: user.u_email,
      role: user.charge,
      company: user.company,
    };
  
    for (const club of clubs) {
      const clubId = club.c_id;
      // Verificar inscripción del usuario en el club
      const isEnrolled = clubUsers[user.u_id] && 
                       clubUsers[user.u_id].some(cu => cu.club_id === clubId);
      
      // Valores por defecto
      userData[`club_${clubId}_percentage`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${clubId}_hours`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${clubId}_date`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${clubId}_score`] = isEnrolled ? 'N/ID' : 'N/A';
      userData[`club_${clubId}_certified`] = isEnrolled ? 'No' : 'N/A';
      
      // Procesar progreso si existe
      if (userProgress[user.u_id] && userProgress[user.u_id][clubId]) {
        const progress = userProgress[user.u_id][clubId];
        
        userData[`club_${clubId}_date`] = progress.last_updated;
        userData[`club_${clubId}_percentage`] = `${Math.round(progress.total_percent)} %`;
      }
      
      // Verificar si el club tiene evaluación
      if (evaluationData.evaluations_by_club[clubId]) {
        const evaluation = evaluationData.evaluations_by_club[clubId];
        
        // Obtener horas del certificado
        let hours = 1;
        if (evaluationData.certificates[evaluation.id] && 
            evaluationData.certificates[evaluation.id].hours > 2) {
          hours = evaluationData.certificates[evaluation.id].hours;
        }
        userData[`club_${clubId}_hours`] = hours;
        
        // Procesar resultado de evaluación
        if (evaluation.type === 'survey') {
          // Para evaluaciones tipo encuesta
          const hasAnswered = evaluationData.survey_answers[user.u_id] && 
                            evaluationData.survey_answers[user.u_id][evaluation.id];
          
          if (hasAnswered) {
            userData[`club_${clubId}_score`] = 'Completado';
            userData[`club_${clubId}_certified`] = 'Sí';
          } else {
            userData[`club_${clubId}_score`] = 'Pendiente';
            userData[`club_${clubId}_certified`] = 'No';
          }
        } else {
          // Para evaluaciones normales
          if (evaluationData.evaluation_results[user.u_id] && 
              evaluationData.evaluation_results[user.u_id][evaluation.id]) {
            const result = evaluationData.evaluation_results[user.u_id][evaluation.id];
            userData[`club_${clubId}_score`] = result.nota;
            userData[`club_${clubId}_certified`] = (result.approved == 1) ? 'Sí' : 'No';
          } else {
            userData[`club_${clubId}_score`] = 'Pendiente';
            userData[`club_${clubId}_certified`] = 'No';
          }
        }
      }
    }
  
    return userData;
  }
}