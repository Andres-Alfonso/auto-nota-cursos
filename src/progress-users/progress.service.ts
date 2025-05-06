import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Not, IsNull } from 'typeorm';
import { read, utils } from 'xlsx';
import * as XLSX from 'xlsx';
import { User } from './entities/user.entity';
import { VideoRoom } from './entities/videoroom.entity';
import { Club } from './entities/club.entity';
import { ExcelRowDto } from './dto/excel-row.dto';
import { unlink } from 'fs/promises';
import { GeneralProgressVideoRoom } from './entities/general-progress-videoroom.entity';
import { Evaluation } from './entities/evaluation.entity';
import { Content } from './entities/content.entity';
import { UserProgressVideoRoom } from './entities/user-progress-videoroom.entity';
import { UserProgressTaskVideoRoom } from './entities/user-pogress-task-videoroom.entity';
import { UserProgressEvaluationVideoRoom } from './entities/user-progress-evaluation-videoroom.entity';
import { DetailWallsVideoRoom } from './entities/detail-walls-videoroom.entity';
import { UserProgressForumVideoRoom } from './entities/user-progress-wall-videoroom.entity';
import { DetailActivitiesVideoRoom } from './entities/detail-activity-videoroom.entity';
import { UserProgressActivityVideoRoom } from './entities/user-progress-activity-videoroom.entity';
import { DetailSelftEvaluationVideoRoom } from './entities/detail-selft-evaluation-videoroom.entity';
import { UserProgressSelftEvaluationVideoRoom } from './entities/user-progress-selft-evaluation.entity';
import { ClubTranslation } from './entities/club_translations.entity';
import { ClubUser } from './entities/club-user.entity';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProgressService {
    private readonly logger = new Logger(ProgressService.name);

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(VideoRoom)
        private videoRoomRepository: Repository<VideoRoom>,
        @InjectRepository(GeneralProgressVideoRoom)
        private generalProgressVideoroomsRepository: Repository<GeneralProgressVideoRoom>,
        @InjectRepository(Evaluation)
        private evaluationRepository: Repository<Evaluation>,
        @InjectRepository(Content)
        private contentRepository: Repository<Content>,
        @InjectRepository(UserProgressVideoRoom)
        private userProgressVideoroomRepository: Repository<UserProgressVideoRoom>,
        @InjectRepository(UserProgressTaskVideoRoom)
        private userProgressTaskVideoroomRepository: Repository<UserProgressTaskVideoRoom>,
        @InjectRepository(UserProgressForumVideoRoom)
        private userProgressForumVideoRoomRepository: Repository<UserProgressForumVideoRoom>,
        @InjectRepository(UserProgressActivityVideoRoom)
        private userProgressActivityVideoRoomRepository: Repository<UserProgressActivityVideoRoom>,
        @InjectRepository(UserProgressEvaluationVideoRoom)
        private userProgressEvaluationVideoRoomRepository: Repository<UserProgressEvaluationVideoRoom>,
        @InjectRepository(UserProgressSelftEvaluationVideoRoom)
        private userProgressSelftEvaluationVideoRoomRepository: Repository<UserProgressSelftEvaluationVideoRoom>,
        @InjectRepository(DetailActivitiesVideoRoom)
        private detailActivitiesVideoRoomRepository: Repository<DetailActivitiesVideoRoom>,
        @InjectRepository(DetailSelftEvaluationVideoRoom)
        private detailSelftEvaluationVideoRoomRepository: Repository<DetailSelftEvaluationVideoRoom>,
        @InjectRepository(DetailWallsVideoRoom)
        private detailWallsVideoRoomRepository: Repository<DetailWallsVideoRoom>,
        @InjectRepository(ClubUser)
        private clubUserRepository: Repository<ClubUser>,
        @InjectRepository(Club)
        private clubRepository: Repository<Club>,
        private dataSource: DataSource,
    ) { }

    async processExcelFile(filePath: string, clubId?: number, clientId?: number): Promise<any> {
        try {
            // Leer el archivo Excel
            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    
            let successCount = 0;
            let errorCount = 0;
            let usersNotFoundCount = 0;
            let countCoursesNotFound = 0;
            let errors: { user: string; course: string; error: string }[] = [];
            let coursesNotFound: string[] = [];
            let usersNotFound: string[] = [];
            let usersAddedToClub = 0;
            let rowIndex = 1;
    
            const headers = rows.shift(); // Remueve la primera fila y la usa como encabezados
            const indexMap = headers.reduce((acc, header, index) => {
                acc[header.trim()] = index;
                return acc;
            }, {});
    
            // Identificar las columnas de cursos - son las que tienen "calificacion" en la siguiente columna
            const courseColumns: any[] = [];
            
            for (let i = 0; i < headers.length; i++) {
                const nextHeader = headers[i + 1];
                if (nextHeader && 
                    (nextHeader.toLowerCase().includes('calificacion') || 
                    nextHeader.toLowerCase().includes('calificación'))) {
                    courseColumns.push({
                        index: i,
                        name: headers[i].trim(),
                        calificacionIndex: i + 1,
                        fechaValidacionIndex: i + 2,
                        duracionIndex: i + 3
                    });
                    
                    this.logger.log(`Columna de curso detectada: ${headers[i].trim()} en índice ${i}`);
                }
            }
            
            if (courseColumns.length === 0) {
                this.logger.error('No se pudieron encontrar columnas de cursos en el Excel');
                throw new HttpException('No se pudieron identificar columnas de cursos en el Excel', HttpStatus.BAD_REQUEST);
            }
            
            this.logger.log(`Total de columnas de cursos detectadas: ${courseColumns.length}`);
            for (const col of courseColumns) {
                this.logger.log(`Curso: ${col.name}, índices: ${JSON.stringify(col)}`);
            }
    
            // Procesar cada fila en una transacción
            for (const row of rows) {
                this.logger.warn(`Procesando fila ${rowIndex}...`);
                const identification = row[indexMap['CEDULA']?.toString().trim() || indexMap['NUMERO DE IDENTIFICACION']]?.toString().trim();
                const email = row[indexMap['CORREO']]?.toString().toLowerCase().trim();
                const userClientId = clientId || parseInt(row[indexMap['Client']], 10);
                const formatDateForMySQL = (date: Date) => {
                    // Verificar si la fecha es válida
                    if (isNaN(date.getTime())) {
                        // Si la fecha no es válida, devolver la fecha actual
                        return new Date().toISOString().slice(0, 19).replace("T", " ");
                    }
                    
                    // Verificar que la fecha no sea anterior a un límite razonable (ej: 1970)
                    if (date.getFullYear() < 1970) {
                        // Si la fecha es demasiado antigua, usar fecha actual
                        return new Date().toISOString().slice(0, 19).replace("T", " ");
                    }
                    
                    return date.toISOString().slice(0, 19).replace("T", " "); // Formato: 'YYYY-MM-DD HH:MM:SS'
                };
                const parseDate = (dateStr: string): string => {
                    if (!dateStr || dateStr.trim() === '') {
                        return formatDateForMySQL(new Date()); // Usar fecha actual si no hay fecha
                    }

                    dateStr = dateStr.trim().replace(/^'+|'+$/g, '');
                    
                    // Manejar casos especiales como '01/00/1900'
                    if (dateStr.includes('00/') || dateStr.includes('/00')) {
                        this.logger.log(`Fecha inválida detectada: ${dateStr}, usando fecha actual`);
                        return formatDateForMySQL(new Date());
                    }
                    
                    try {
                        let date: Date;
                        
                        // Comprobar si es formato DD/MM/YYYY
                        if (dateStr.includes('/')) {
                            const parts = dateStr.split('/').map(p => parseInt(p.trim(), 10));

                            // this.logger.log(parts);
                            
                            // Si alguna parte no es un número, usar fecha actual
                            if (parts.some(isNaN)) {
                                this.logger.log(`Formato de fecha inválido: ${dateStr}, usando fecha actual`);
                                return formatDateForMySQL(new Date());
                            }
                            
                            const [month, day, year] = parts;
                            
                            // Siempre asumir formato DD/MM/YYYY
                            date = new Date(year, month - 1, day);
                            
                            // Manejar años de 2 dígitos
                            if (year < 100) {
                                date.setFullYear(2000 + year);
                            }
                        } else if (dateStr.includes('-')) {
                            // Para formato con guiones, dividir y ordenar como DD/MM/YYYY
                            const parts = dateStr.split('-').map(p => parseInt(p.trim(), 10));
                            
                            if (parts.length === 3) {
                                // Asumir que viene como DD-MM-YYYY
                                const [day, month, year] = parts;
                                date = new Date(year, month - 1, day);
                                
                                // Manejar años de 2 dígitos
                                if (year < 100) {
                                    date.setFullYear(2000 + year);
                                }
                            } else {
                                // Si no tiene 3 partes, intentar parsear directamente
                                date = new Date(dateStr);
                            }
                        } else {
                            // Intentar parsear directamente
                            date = new Date(dateStr);
                        }
                        
                        // Verificar si la fecha resultante es válida
                        if (isNaN(date.getTime()) || date.getFullYear() < 1970) {
                            this.logger.log(`Fecha inválida después del parseo: ${dateStr}, usando fecha actual`);
                            return formatDateForMySQL(new Date());
                        }
                        
                        return formatDateForMySQL(date);
                    } catch (error) {
                        this.logger.error(`Error al parsear fecha ${dateStr}: ${error.message}`);
                        return formatDateForMySQL(new Date());
                    }
                };
                let firstProgressDate = formatDateForMySQL(new Date());  // Si no hay fecha específica, usar la fecha actual
                let lastProgressDate = formatDateForMySQL(new Date());
    
                try {
                        // Buscar usuario por identificación o correo
                        const whereConditions: any[] = [];
                        
                        if (identification) {
                            whereConditions.push({ identification: identification, client_id: userClientId });
                        }
                        
                        // if (email) {
                        //     whereConditions.push({ email: email, client_id: userClientId });
                        // }
                        
                        console.log(whereConditions.length);
                        if (whereConditions.length === 0) {
                            this.logger.warn(`Identificación o correo no proporcionados`);
                        }
                        
                        await this.dataSource.transaction(async (manager) => {

                        const user = await manager.getRepository(User).findOne({where: whereConditions});

                        console.log(user);
    
                        if (!user) {
                            usersNotFoundCount++;
                            usersNotFound.push(`Identificación: ${identification || 'No proporcionada'} - Correo: ${email || 'No proporcionado'}`);
                            this.logger.warn(`Usuario no encontrado: ${identification || ''} / ${email || ''}`);
                            return; // Usar return en lugar de continue para salir de la transacción actual
                        }
    
                        // Procesar cada curso en la fila
                        for (const courseColumn of courseColumns) {
                            // Mostrar información de debugging
                            this.logger.log(`Procesando curso: ${courseColumn.name}`);
                            
                            // Obtener el valor del curso (APROBADO/NO APLICA)
                            const courseValue = row[courseColumn.index]?.toString().trim();
                            
                            this.logger.log(`Valor del curso: ${courseValue}`);
                            
                            // Si es NO APLICA o está vacío, saltar este curso
                            if (!courseValue || courseValue === 'NO APLICA') {
                                this.logger.log(`Saltando curso ${courseColumn.name} porque es NO APLICA o vacío`);
                                continue;
                            }
                            
                            // Verificar si está APROBADO
                            // if (courseValue.toUpperCase() !== 'APROBADO' && 
                            //     !courseValue.toUpperCase().includes('APROB')) {
                            //     this.logger.log(`Saltando curso ${courseColumn.name} porque no está APROBADO: ${courseValue}`);
                            //     continue;
                            // }

                            const calificacionValue = row[courseColumn.calificacionIndex]?.toString().trim();
                            this.logger.log(`Calificación: ${calificacionValue}`);
                            
                            // NUEVA LÓGICA: Verificar si está APROBADO y tiene calificación
                            const isApproved = courseValue.toUpperCase() === 'APROBADO' || 
                                            courseValue.toUpperCase().includes('APROB') || courseValue.toUpperCase() === 'PENDIENTE' || 
                                            courseValue.toUpperCase().includes('PENDI');
                            const hasCalificacion = !!calificacionValue;

                            // Si no está aprobado o no tiene calificación, saltar este curso
                            if(clubId == null){
                                if (!isApproved) {
                                    this.logger.log(`Saltando curso ${courseColumn.name} porque no está aprobado. Aprobado: ${isApproved}`);
                                    continue;
                                }
                            }


                            this.logger.log(`Fecha antes de parseo ${row[courseColumn.fechaValidacionIndex]}`);
                            // Obtener fecha de validación si está disponible
                            let fechaValidacion = parseDate(row[courseColumn.fechaValidacionIndex]?.toString().trim());
                            this.logger.log(`Fechas ${fechaValidacion}`);

                            if (fechaValidacion) { // Solo asigna si fechaValidacion tiene un valor
                                firstProgressDate = fechaValidacion;
                                lastProgressDate = fechaValidacion;
                            }


                            // IMPORTANTE: El courseName ahora será el nombre de la columna, no el valor
                            const courseName = courseColumn.name;
                            
                            // Buscar videoroom por nombre del curso
                            let videoRooms: VideoRoom[] = [];
                            let currentClubId: number | null = null;
                            
                            if (clubId) {
                                // Si se proporciona clubId, buscar todos los videorooms de ese club
                                currentClubId = clubId;

                                // Si se proporciona clubId, buscar todos los videorooms de ese club
                                videoRooms = await manager.getRepository(VideoRoom).find({
                                    where: { club_id: clubId },
                                    relations: ['club']
                                });
                                
                                if (!videoRooms || videoRooms.length === 0) {
                                    this.logger.warn(`No se encontraron VideoRooms para el club_id: ${clubId}`);
                                    if (!coursesNotFound.includes(courseName)) {
                                        coursesNotFound.push(courseName);
                                    }
                                    continue;
                                }
                            } else {
                                // Primero intentar buscar coincidencia exacta del título del curso
                                const clubTranslation = await manager.getRepository(ClubTranslation).findOne({
                                    where: { title: courseName }
                                });

                                this.logger.log(`Busqueda id de curso: ${clubTranslation?.club_id}`);
                                
                                // Si hay coincidencia exacta
                                if (clubTranslation) {
                                    currentClubId = clubTranslation.club_id;
                                    videoRooms = await manager.getRepository(VideoRoom).find({
                                        where: { club_id: clubTranslation.club_id },
                                        relations: ['club']
                                    });
                                } else {
                                    // Usar LIKE para buscar coincidencias parciales
                                    const partialMatches = await manager.query(`
                                        SELECT * FROM club_translations 
                                        WHERE title LIKE ? 
                                        LIMIT 1
                                    `, [`%${courseName}%`]);
                                    
                                    if (partialMatches && partialMatches.length > 0) {
                                        currentClubId = partialMatches[0].club_id;
                                        videoRooms = await manager.getRepository(VideoRoom).find({
                                            where: { club_id: partialMatches[0].club_id },
                                            relations: ['club']
                                        });
                                    }
                                }

                                if (!videoRooms || videoRooms.length === 0) {
                                    // Registrar que no se encontró el curso y continuar con el siguiente
                                    this.logger.warn(`No se encontró ningún VideoRoom para el curso: ${courseName}`);
                                    if (!coursesNotFound.includes(courseName)) {
                                        coursesNotFound.push(courseName);
                                        countCoursesNotFound++;
                                    }
                                    continue;
                                }
                            }

                            // VALIDACIÓN ACTUALIZADA: 
                            // Ya verificamos que el curso está aprobado y tiene calificación
                            // Ahora verificamos si el usuario ya está registrado en el club
                            if (currentClubId) {
                                const existingClubUser = await manager.getRepository(ClubUser).findOne({
                                    where: {
                                        club_id: currentClubId,
                                        user_id: user.id
                                    }
                                });
                                
                                // Si el usuario no está registrado en el club, agregarlo
                                if (!existingClubUser) {
                                    this.logger.log(`Agregando usuario ID ${user.id} al club ID ${currentClubId} (curso aprobado con calificación: ${calificacionValue})`);
                                    
                                    const newClubUser = new ClubUser();
                                    newClubUser.club_id = currentClubId;
                                    newClubUser.user_id = user.id;
                                    
                                    await manager.getRepository(ClubUser).save(newClubUser);
                                    usersAddedToClub++;
                                    
                                    this.logger.log(`Usuario ID ${user.id} agregado exitosamente al club ID ${currentClubId}`);
                                } else {
                                    this.logger.log(`Usuario ID ${user.id} ya está registrado en el club ID ${currentClubId}`);
                                }
                            }

                            if (!hasCalificacion) {
                                this.logger.log(`Saltando curso ${courseColumn.name} porque no tiene calificación: ${hasCalificacion}`);
                                continue;
                            }
                            
                            // Convertir calificación a número
                            let notaCalificacion = 0; // Valor por defecto
                            const numMatch = calificacionValue.match(/\d+(\.\d+)?/);
                            if (numMatch) {
                                notaCalificacion = parseFloat(numMatch[0]);
                            }

                            this.logger.log(`Nota calificación procesada: ${notaCalificacion}`);

                            this.logger.log(`Encontrados ${videoRooms.length} VideoRooms para el curso: ${courseName}`);

                            for (const videoRoom of videoRooms){
                                // Actualizar progreso general del videoroom
                                const existingProgress = await this.generalProgressVideoroomsRepository.findOne({
                                    where: { id_user: user.id, id_videoroom: videoRoom.id },
                                });

                                
                                if (existingProgress) {
                                    // Actualizar el registro existente
                                    existingProgress.porcen = 100;
                                    existingProgress.created_at = firstProgressDate;
                                    existingProgress.updated_at = lastProgressDate;
                                    await this.generalProgressVideoroomsRepository.save(existingProgress);
                                    this.logger.log(`Se actualiza videoroom: ${existingProgress.id_videoroom}`);
                                } else {
                                    // Crear un nuevo registro
                                    await this.generalProgressVideoroomsRepository.save({
                                        id_user: user.id,
                                        id_videoroom: videoRoom.id,
                                        porcen: 100,
                                        created_at: firstProgressDate,
                                        updated_at: lastProgressDate,
                                    });
                                    this.logger.log(`Se crea nuevo registro para el videoroom: ${videoRoom.id}`);
                                }
        
                                // Obtener los contenidos del videoroom
                                const videoRoomContents = await manager.query(`
                                    SELECT content_id FROM videoroom_content WHERE videoroom_id = ?
                                `, [videoRoom.id]);
        
                                // Actualizar progreso para cada contenido
                                for (const content of videoRoomContents){
                                    const existingProgressVideoroom = await this.userProgressVideoroomRepository.findOne({
                                        where: { id_content: content.content_id, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressVideoroom) {
                                        // Actualizar el registro existente
                                        existingProgressVideoroom.porcen = 100;
                                        existingProgressVideoroom.created_at = firstProgressDate;
                                        existingProgressVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressVideoroomRepository.save(existingProgressVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressVideoroomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_content: content.content_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Resto del código para actualizar tareas, muros, actividades, etc.
                                // (Se mantiene igual al código existente pero usando videoRoom.id)
        
                                // Obtener detalles de las tareas asociadas al videoroom
                                const taskDetails = await manager.query(`
                                        SELECT tasks_id FROM detail_tasks_videorooms WHERE videorooms_id = ?
                                    `, [videoRoom.id]);
        
                                // Actualizar progreso para cada tarea
                                for (const task of taskDetails){
                                    const existingProgressTaskVideoroom = await this.userProgressTaskVideoroomRepository.findOne({
                                        where: { id_task: task.tasks_id, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressTaskVideoroom) {
                                        // Actualizar el registro existente
                                        existingProgressTaskVideoroom.porcen = 100;
                                        existingProgressTaskVideoroom.created_at = firstProgressDate;
                                        existingProgressTaskVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressTaskVideoroomRepository.save(existingProgressTaskVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressTaskVideoroomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_task: task.tasks_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Actualziar o crear progreso para cada muro
                                const wallsDetails = await this.detailWallsVideoRoomRepository.find({
                                    where: { videorooms_id: videoRoom.id },
                                });
                                
                                for (const wall of wallsDetails){
                                    const existingProgressWallVideoroom = await this.userProgressForumVideoRoomRepository.findOne({
                                        where: { id_advertisements: wall.advertisements_id, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressWallVideoroom) {
                                        // Actualizar el registro existente
                                        existingProgressWallVideoroom.porcen = 100;
                                        existingProgressWallVideoroom.created_at = firstProgressDate;
                                        existingProgressWallVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressForumVideoRoomRepository.save(existingProgressWallVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressForumVideoRoomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_advertisements: wall.advertisements_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Actualizar o crear progreso para cada actividad
                                const activityDetails = await this.detailActivitiesVideoRoomRepository.find({
                                    where: { id_videoroom: videoRoom.id },
                                });
        
                                for (const activity of activityDetails){
                                    const existingProgressActivitesVideoroom = await this.userProgressActivityVideoRoomRepository.findOne({
                                        where: { id_activity: activity.id_activities, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressActivitesVideoroom) {
                                        // Actualizar el registro existente
                                        existingProgressActivitesVideoroom.porcen = 100;
                                        existingProgressActivitesVideoroom.created_at = firstProgressDate;
                                        existingProgressActivitesVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressActivityVideoRoomRepository.save(existingProgressActivitesVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressActivityVideoRoomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_activity: activity.id_activities,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Actualizar o crear progreso para cada autoevaluación
                                const selftEvaluationDetails = await this.detailSelftEvaluationVideoRoomRepository.find({
                                    where: { id_videoroom: videoRoom.id },
                                });
                                
                                for (const selftEvaluation of selftEvaluationDetails){
                                    const existingProgressSelftEvaluationVideoroom = await this.userProgressSelftEvaluationVideoRoomRepository.findOne({
                                        where: { selft_evaluations_id: selftEvaluation.selft_evaluations_id, user_id: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressSelftEvaluationVideoroom) {
                                        // Actualizar el registro existente
                                        existingProgressSelftEvaluationVideoroom.porcen = 100;
                                        existingProgressSelftEvaluationVideoroom.created_at = firstProgressDate;
                                        existingProgressSelftEvaluationVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressSelftEvaluationVideoRoomRepository.save(existingProgressSelftEvaluationVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressSelftEvaluationVideoRoomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_advertisements: selftEvaluation.selft_evaluations_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }

                                this.logger.log(`Se buscan encuestas`);
                                const pollsDetails = await this.videoRoomRepository.find({
                                    where: { id: videoRoom.id, id_polls: Not(IsNull()) }
                                });
                                
                                // this.logger.log(`Encuestas: ${JSON.stringify(pollsDetails)}`);
                                
                                for (const poll of pollsDetails) {
                                    const nota = notaCalificacion;
                                    
                                    // Verificar si ya existe el registro de progreso
                                    const [existingProgress] = await manager.query(`
                                        SELECT id FROM user_pogress_evaluation_video_rooms 
                                        WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                    `, [user.id, videoRoom.id, poll.id_polls]);
                                    
                                    if (existingProgress) {
                                        
                                        await manager.query(`
                                            UPDATE user_pogress_evaluation_video_rooms 
                                            SET porcen = ?, created_at = ?, updated_at = ?
                                            WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                        `, [nota, firstProgressDate, lastProgressDate, user.id, videoRoom.id, poll.id_polls]);
                                        
                                        this.logger.log(`Actualizado progreso de evaluación para user_id=${user.id}, videoroom_id=${videoRoom.id}, evaluation_id=${poll.id_polls}`);
                                    } else {
                                        // Insertar nuevo registro
                                        await manager.query(`
                                            INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen, created_at, updated_at)
                                            VALUES (?, ?, ?, ?, ?, ?)
                                        `, [user.id, videoRoom.id, poll.id_polls, nota, firstProgressDate, lastProgressDate]);
                                        
                                        this.logger.log(`Creado nuevo progreso de evaluación para user_id=${user.id}, videoroom_id=${videoRoom.id}, evaluation_id=${poll.id_polls}`);
                                    }
                                    
                                    const [evaluation] = await manager.query(`
                                        SELECT * FROM evaluations WHERE id = ?
                                    `, [poll.id_polls]);
                                    
                                    if (evaluation) {
                                        const maxAttempts = evaluation.attempts || Number.MAX_SAFE_INTEGER;
                                        
                                        // Verificar intentos existentes
                                        const [existingAttempts] = await manager.query(`
                                            SELECT COUNT(*) as count FROM evaluation_users 
                                            WHERE user_id = ? AND evaluation_id = ?
                                        `, [user.id, poll.id_polls]);
                                        
                                        if (existingAttempts.count < maxAttempts) {
                                            // Verificar si ya existe el registro de usuario-evaluación
                                            const [existingEvalUser] = await manager.query(`
                                                SELECT id FROM evaluation_users 
                                                WHERE user_id = ? AND evaluation_id = ?
                                            `, [user.id, poll.id_polls]);
                                            
                                            if (existingEvalUser) {
                                                // Actualizar registro existente sin tocar updated_at
                                                await manager.query(`
                                                    UPDATE evaluation_users 
                                                    SET nota = ?, created_at = ?, updated_at = ?, approved = 1, intentos = intentos + 1 
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [nota, firstProgressDate, lastProgressDate, user.id, poll.id_polls]);
                                                
                                                this.logger.log(`Actualizado evaluation_users para user_id=${user.id}, evaluation_id=${poll.id_polls}`);
                                            } else {
                                                // Insertar nuevo registro
                                                await manager.query(`
                                                    INSERT INTO evaluation_users (user_id, evaluation_id, nota, approved, intentos, created_at, updated_at)
                                                    VALUES (?, ?, ?, 1, 1, ?, ?)
                                                `, [user.id, poll.id_polls, nota, firstProgressDate, lastProgressDate]);
                                                
                                                this.logger.log(`Creado nuevo evaluation_users para user_id=${user.id}, evaluation_id=${poll.id_polls}`);
                                            }
                                            
                                            // Verificar si ya existe un registro en el historial con los mismos valores
                                            const [existingHistory] = await manager.query(`
                                                SELECT id FROM evaluation_history 
                                                WHERE evaluation_id = ? AND user_id = ? AND nota = ? AND approved = 1
                                                LIMIT 1
                                            `, [poll.id_polls, user.id, nota]);
                                            
                                            if (!existingHistory) {
                                                // Insertar en historial solo si no existe un registro idéntico
                                                await manager.query(`
                                                    INSERT INTO evaluation_history (evaluation_id, user_id, nota, approved, created_at, updated_at)
                                                    VALUES (?, ?, ?, 1, ?, ?)
                                                `, [poll.id_polls, user.id, nota, firstProgressDate, lastProgressDate]);
                                                
                                                this.logger.log(`Creado registro en evaluation_history para evaluation_id=${poll.id_polls}, user_id=${user.id}`);
                                            } else {
                                                this.logger.log(`Registro similar ya existe en evaluation_history para evaluation_id=${poll.id_polls}, user_id=${user.id}`);
                                            }
                                            
                                            // Procesar respuestas a preguntas
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                            `, [poll.id_polls]);
                                            
                                            for (const question of questions) {
                                                // Verificar si ya existe una respuesta para esta pregunta
                                                const [existingAnswer] = await manager.query(`
                                                    SELECT id FROM answers 
                                                    WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                    LIMIT 1
                                                `, [poll.id_polls, question.id, user.id]);
                                                
                                                if (!existingAnswer) {
                                                    if (question.type === 'open_answer') {
                                                        await manager.query(`
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                            VALUES (?, ?, NULL, ?, 'Homologacion', ?, ?)
                                                        `, [poll.id_polls, question.id, user.id, firstProgressDate, lastProgressDate]);
                                                    } else {
                                                        let [option] = await manager.query(`
                                                            SELECT * FROM options WHERE question_id = ? AND correct = 1 LIMIT 1
                                                        `, [question.id]);
                                                        
                                                        if (!option) {
                                                            [option] = await manager.query(`
                                                                SELECT id FROM options WHERE question_id = ? LIMIT 1
                                                            `, [question.id]);
                                                        }
                                                        
                                                        if (option) {
                                                            await manager.query(`
                                                                INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                                VALUES (?, ?, ?, ?, NULL, ?, ?)
                                                            `, [poll.id_polls, question.id, option.id, user.id, firstProgressDate, lastProgressDate]);
                                                        }
                                                    }
                                                    this.logger.log(`Creada respuesta para question_id=${question.id}, user_id=${user.id}`);
                                                } else {
                                                    this.logger.log(`Respuesta ya existe para question_id=${question.id}, user_id=${user.id}`);
                                                }
                                            }
                                        } else {
                                            this.logger.log(`Se ha alcanzado el máximo de intentos (${maxAttempts}) para user_id=${user.id}, evaluation_id=${poll.id_polls}`);
                                        }
                                    }
                                }

        
                                // Obtener detalles de evaluación
                                const evaluationDetails = await manager.query(`
                                    SELECT id_evaluation FROM detail_evaluation_video_rooms WHERE id_videoroom = ?
                                `, [videoRoom.id]);

                                // Procesar cada evaluación
                                for (const evalDetail of evaluationDetails) {
                                    // Determinar la nota (calificación del Excel o 100 por defecto)
                                    const nota = notaCalificacion; // Usamos la calificación obtenida de la columna del Excel

                                    // Verificar si ya existe el registro de progreso
                                    const [existingProgress] = await manager.query(`
                                        SELECT id FROM user_pogress_evaluation_video_rooms 
                                        WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                    `, [user.id, videoRoom.id, evalDetail.id_evaluation]);
                                    
                                    if (existingProgress) {
                                        // Actualizar sin modificar updated_at
                                        await manager.query(`
                                            UPDATE user_pogress_evaluation_video_rooms 
                                            SET porcen = ?, created_at = ?, updated_at = ? 
                                            WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                        `, [nota, firstProgressDate, lastProgressDate, user.id, videoRoom.id, evalDetail.id_evaluation]);
                                        
                                        this.logger.log(`Actualizado progreso de evaluación para user_id=${user.id}, videoroom_id=${videoRoom.id}, evaluation_id=${evalDetail.id_evaluation}`);
                                    } else {
                                        // Insertar nuevo registro
                                        await manager.query(`
                                            INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen, created_at, updated_at)
                                            VALUES (?, ?, ?, ?, ?, ?)
                                        `, [user.id, videoRoom.id, evalDetail.id_evaluation, nota, firstProgressDate, lastProgressDate]);
                                        
                                        this.logger.log(`Creado nuevo progreso de evaluación para user_id=${user.id}, videoroom_id=${videoRoom.id}, evaluation_id=${evalDetail.id_evaluation}`);
                                    }

                                    // Obtener evaluación para verificar configuraciones
                                    const evaluation = await manager.query(`
                                        SELECT * FROM evaluations WHERE id = ?
                                    `, [evalDetail.id_evaluation]);

                                    if (evaluation?.length > 0) {
                                        const maxAttempts = evaluation[0].attempts || Number.MAX_SAFE_INTEGER;

                                        // Verificar intentos actuales
                                        const existingAttempts = await manager.query(`
                                            SELECT COUNT(*) as count FROM evaluation_users 
                                            WHERE user_id = ? AND evaluation_id = ?
                                        `, [user.id, evalDetail.id_evaluation]);

                                        if (existingAttempts[0].count < maxAttempts) {
                                            // Verificar si ya existe el registro de usuario-evaluación
                                            const [existingEvalUser] = await manager.query(`
                                                SELECT id FROM evaluation_users 
                                                WHERE user_id = ? AND evaluation_id = ?
                                            `, [user.id, evalDetail.id_evaluation]);
                                            
                                            if (existingEvalUser) {
                                                // Actualizar registro existente sin tocar updated_at
                                                await manager.query(`
                                                    UPDATE evaluation_users 
                                                    SET nota = ?, created_at = ?, updated_at = ?, approved = 1, intentos = intentos + 1
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [nota, firstProgressDate, lastProgressDate, user.id, evalDetail.id_evaluation]);
                                                
                                                this.logger.log(`Actualizado evaluation_users para user_id=${user.id}, evaluation_id=${evalDetail.id_evaluation}`);
                                            } else {
                                                // Insertar nuevo registro
                                                await manager.query(`
                                                    INSERT INTO evaluation_users (user_id, evaluation_id, nota, approved, intentos, created_at, updated_at)
                                                    VALUES (?, ?, ?, 1, 1, ?, ?)
                                                `, [user.id, evalDetail.id_evaluation, nota, firstProgressDate, lastProgressDate]);
                                                
                                                this.logger.log(`Creado nuevo evaluation_users para user_id=${user.id}, evaluation_id=${evalDetail.id_evaluation}`);
                                            }
                                            
                                            // Verificar si ya existe un registro en el historial con los mismos valores
                                            const [existingHistory] = await manager.query(`
                                                SELECT id FROM evaluation_history 
                                                WHERE evaluation_id = ? AND user_id = ? AND nota = ? AND approved = 1
                                                LIMIT 1
                                            `, [evalDetail.id_evaluation, user.id, nota]);
                                            
                                            if (!existingHistory) {
                                                // Insertar en historial solo si no existe un registro idéntico
                                                await manager.query(`
                                                    INSERT INTO evaluation_history (evaluation_id, user_id, nota, approved, created_at, updated_at)
                                                    VALUES (?, ?, ?, 1, ?, ?)
                                                `, [evalDetail.id_evaluation, user.id, nota, firstProgressDate, lastProgressDate]);
                                                
                                                this.logger.log(`Creado registro en evaluation_history para evaluation_id=${evalDetail.id_evaluation}, user_id=${user.id}`);
                                            } else {
                                                this.logger.log(`Registro similar ya existe en evaluation_history para evaluation_id=${evalDetail.id_evaluation}, user_id=${user.id}`);
                                            }

                                            // Obtener preguntas de la evaluación
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                            `, [evalDetail.id_evaluation]);

                                            // Crear respuestas para cada pregunta
                                            for (const question of questions) {
                                                // Verificar si ya existe una respuesta para esta pregunta
                                                const [existingAnswer] = await manager.query(`
                                                    SELECT id FROM answers 
                                                    WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                    LIMIT 1
                                                `, [evalDetail.id_evaluation, question.id, user.id]);
                                                
                                                if (!existingAnswer) {
                                                    if (question.type === 'open_answer') {
                                                        await manager.query(`
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                            VALUES (?, ?, NULL, ?, 'Homologacion', ?, ?)
                                                        `, [evalDetail.id_evaluation, question.id, user.id, firstProgressDate, lastProgressDate]);
                                                    } else {
                                                        // Obtener primera opción correcta
                                                        const option = await manager.query(`
                                                            SELECT * FROM options 
                                                            WHERE question_id = ? AND correct = 1
                                                            LIMIT 1
                                                        `, [question.id]);

                                                        // Si no hay opción correcta, obtener la primera
                                                        const optionId = option.length > 0
                                                            ? option[0].id
                                                            : (await manager.query(`
                                                            SELECT id FROM options 
                                                            WHERE question_id = ? 
                                                            LIMIT 1
                                                        `, [question.id]))[0]?.id;

                                                        if (optionId) {
                                                            await manager.query(`
                                                                INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                                VALUES (?, ?, ?, ?, NULL, ?, ?)
                                                            `, [evalDetail.id_evaluation, question.id, optionId, user.id, firstProgressDate, lastProgressDate]);
                                                        }
                                                    }
                                                    this.logger.log(`Creada respuesta para question_id=${question.id}, user_id=${user.id}`);
                                                } else {
                                                    this.logger.log(`Respuesta ya existe para question_id=${question.id}, user_id=${user.id}`);
                                                }
                                            }
                                        } else {
                                            this.logger.log(`Se ha alcanzado el máximo de intentos (${maxAttempts}) para user_id=${user.id}, evaluation_id=${evalDetail.id_evaluation}`);
                                        }
                                    }
                                }
                            }
                            successCount++;
                        }
                    });
                } catch (error) {
                    errorCount++;
                    errors.push({
                        user: `Identificación: ${identification || 'No proporcionada'} - Correo: ${email || 'No proporcionado'}`,
                        course: 'Múltiples cursos',
                        error: `Error: ${error.message}`
                    });
                    this.logger.error(`Error en fila ${rowIndex}: ${error.message}`);
                }
                rowIndex++;
            }
    
            // Eliminar archivo después de procesar
            await unlink(filePath);

            this.logger.warn({
                message: 'Proceso completado',
                total: rows.length,
                success: successCount,
                errors: errorCount,
                errorDetails: errors,
                countCoursesNotFound: countCoursesNotFound,
                coursesNotFound: coursesNotFound,
                usersNotFound: usersNotFoundCount,
                usersAddedToClub
            });
    
            return {
                message: 'Proceso completado',
                total: rows.length,
                success: successCount,
                errors: errorCount,
                errorDetails: errors,
                countCoursesNotFound: countCoursesNotFound,
                coursesNotFound: coursesNotFound, // Incluir los cursos que no se encontraron
                usersAddedToClub
            };
        } catch (error) {
            this.logger.error(`Error procesando archivo: ${error.message}`);
            throw new HttpException(
                `Error al procesar el archivo: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async clubUserExcelFile(filePath: string, clubId?: number, clientId?: number): Promise<any> {
        try {
            // Leer el archivo Excel
            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    
            let successCount = 0;
            let errorCount = 0;
            let usersNotFoundCount = 0;
            let countCoursesNotFound = 0;
            let errors: { user: string; course: string; error: string }[] = [];
            let coursesNotFound: string[] = [];
            let usersNotFound: string[] = [];
            let usersAddedToClub = 0;
            let usersRemovedFromClub = 0;
            
            // Arrays para registrar detalles para el reporte
            let detailedResults: {
                identification: string;
                email: string;
                courseName: string;
                action: string;  // "added", "removed", "already_registered", "not_found", "course_not_found"
                status: string;  // "success", "error"
                message: string;
            }[] = [];
    
            const headers = rows.shift(); // Remueve la primera fila y la usa como encabezados
            const indexMap = headers.reduce((acc, header, index) => {
                acc[header.trim()] = index;
                return acc;
            }, {});
    
            // Identificar las columnas de cursos - son las que tienen "calificacion" en la siguiente columna
            const courseColumns: any[] = [];
            
            for (let i = 0; i < headers.length; i++) {
                const nextHeader = headers[i + 1];
                if (nextHeader && 
                    (nextHeader.toLowerCase().includes('calificacion') || 
                    nextHeader.toLowerCase().includes('calificación'))) {
                    courseColumns.push({
                        index: i,
                        name: headers[i].trim(),
                        calificacionIndex: i + 1,
                        fechaValidacionIndex: i + 2,
                        duracionIndex: i + 3
                    });
                    
                    this.logger.log(`Columna de curso detectada: ${headers[i].trim()} en índice ${i}`);
                }
            }
            
            if (courseColumns.length === 0) {
                this.logger.error('No se pudieron encontrar columnas de cursos en el Excel');
                throw new HttpException('No se pudieron identificar columnas de cursos en el Excel', HttpStatus.BAD_REQUEST);
            }
            
            this.logger.warn(`Total de columnas de cursos detectadas: ${courseColumns.length}`);
            for (const col of courseColumns) {
                this.logger.log(`Curso: ${col.name}, índices: ${JSON.stringify(col)}`);
            }
    
            // Procesar cada fila en una transacción
            for (const row of rows) {
                const identification = row[indexMap['CEDULA']?.toString().trim() || indexMap['NUMERO DE IDENTIFICACION']]?.toString().trim();
                const email = row[indexMap['CORREO']]?.toString().toLowerCase().trim();
                const userClientId = clientId || parseInt(row[indexMap['Client']], 10);
    
                try {
                    await this.dataSource.transaction(async (manager) => {
                        // Buscar usuario por identificación o correo
                        const whereConditions: any[] = [];
                        
                        if (identification) {
                            whereConditions.push({ identification: identification, client_id: userClientId });
                        }
                        
                        // if (email) {
                        //     whereConditions.push({ email: email, client_id: userClientId });
                        // }
                        
                        if (whereConditions.length === 0) {
                            throw new Error('Identificación o correo no proporcionados');
                        }
                        
                        const user = await manager.getRepository(User).findOne({where: whereConditions});
    
                        if (!user) {
                            usersNotFoundCount++;
                            usersNotFound.push(`Identificación: ${identification || 'No proporcionada'} - Correo: ${email || 'No proporcionado'}`);
                            this.logger.warn(`Usuario no encontrado: ${identification || ''} / ${email || ''}`);
                            
                            // Registrar usuario no encontrado en detalles
                            detailedResults.push({
                                identification: identification || 'No proporcionada',
                                email: email || 'No proporcionado',
                                courseName: 'N/A',
                                action: 'not_found',
                                status: 'error',
                                message: 'Usuario no encontrado en el sistema'
                            });
                            
                            return; // Usar return en lugar de continue para salir de la transacción actual
                        } else {
                            this.logger.warn(`--------------------------------------------------------------`);
                            this.logger.warn(`Usuario encontrado: ${identification || ''} / ${email || ''}`);
                            this.logger.warn(`--------------------------------------------------------------`);
                        }
    
                        // Procesar cada curso en la fila
                        for (const courseColumn of courseColumns) {
                            // Mostrar información de debugging
                            this.logger.log(`Procesando curso: ${courseColumn.name}`);
                            
                            // Obtener el valor del curso (APROBADO/PENDIENTE/NO APLICA)
                            const courseValue = row[courseColumn.index]?.toString().trim();
                            
                            this.logger.log(`Valor del curso: ${courseValue}`);
                            
                            // Si está vacío, saltar este curso
                            if (!courseValue) {
                                this.logger.log(`Saltando curso ${courseColumn.name} porque está vacío`);
                                continue;
                            }
                            
                            // IMPORTANTE: El courseName ahora será el nombre de la columna, no el valor
                            const courseName = courseColumn.name;
                            
                            // Buscar videoroom por nombre del curso
                            let currentClubId: number | null = null;
                            
                            if (clubId) {
                                // Si se proporciona clubId
                                currentClubId = clubId;
                            } else {
                                // Primero intentar buscar coincidencia exacta del título del curso
                                const clubTranslation = await manager.getRepository(ClubTranslation).findOne({
                                    where: { title: courseName }
                                });
    
                                this.logger.log(`Busqueda id de curso: ${clubTranslation?.club_id}`);
                                
                                // Si hay coincidencia exacta
                                if (clubTranslation) {
                                    currentClubId = clubTranslation.club_id;
                                } else {
                                    // Usar LIKE para buscar coincidencias parciales
                                    const partialMatches = await manager.query(`
                                        SELECT * FROM club_translations 
                                        WHERE title LIKE ? 
                                        LIMIT 1
                                    `, [`%${courseName}%`]);
                                    
                                    if (partialMatches && partialMatches.length > 0) {
                                        currentClubId = partialMatches[0].club_id;
                                    }
                                }
                            }
    
                            if (!currentClubId) {
                                countCoursesNotFound++;
                                if (!coursesNotFound.includes(courseName)) {
                                    coursesNotFound.push(courseName);
                                }
                                this.logger.warn(`Curso no encontrado: ${courseName}`);
                                
                                // Registrar curso no encontrado en detalles
                                detailedResults.push({
                                    identification: identification || 'No proporcionada',
                                    email: email || 'No proporcionado',
                                    courseName: courseName,
                                    action: 'course_not_found',
                                    status: 'error',
                                    message: 'Curso no encontrado en el sistema'
                                });
                                
                                continue; // Saltar al siguiente curso
                            }
    
                            // Ahora verificamos si el usuario ya está registrado en el club
                            const existingClubUser = await manager.getRepository(ClubUser).findOne({
                                where: {
                                    club_id: currentClubId,
                                    user_id: user.id
                                }
                            });
                            
                            // Comprobar si el valor del curso es APROBADO o PENDIENTE
                            const valueUpperCase = courseValue.toUpperCase();
                            const shouldBeInCourse = valueUpperCase === 'APROBADO' || 
                                                   valueUpperCase.includes('APROB') || 
                                                   valueUpperCase === 'PENDIENTE' ||
                                                   valueUpperCase.includes('PEND');
                            
                            // Si debe estar en el curso pero no está registrado
                            if (shouldBeInCourse && !existingClubUser) {
                                this.logger.log(`Agregando usuario ID ${user.id}, identificacion ${user.identification} al club ID ${currentClubId}`);
                                
                                const newClubUser = new ClubUser();
                                newClubUser.club_id = currentClubId;
                                newClubUser.user_id = user.id;
                                
                                await manager.getRepository(ClubUser).save(newClubUser);
                                usersAddedToClub++;
                                
                                this.logger.log(`Usuario ID ${user.id} agregado exitosamente al club ID ${currentClubId}`);
                                
                                // Registrar adición en detalles
                                detailedResults.push({
                                    identification: identification || 'No proporcionada',
                                    email: email || 'No proporcionado',
                                    courseName: courseName,
                                    action: 'added',
                                    status: 'success',
                                    message: `Usuario agregado al curso (${valueUpperCase})`
                                });
                                
                                successCount++;
                            } 
                            // Si no debe estar en el curso (NO APLICA) pero está registrado
                            else if (valueUpperCase === 'NO APLICA' && existingClubUser) {
                                this.logger.log(`Eliminando usuario ID ${user.id} del club ID ${currentClubId}`);
                                
                                await manager.getRepository(ClubUser).remove(existingClubUser);
                                usersRemovedFromClub++;
                                
                                this.logger.log(`Usuario ID ${user.id} eliminado exitosamente del club ID ${currentClubId}`);
                                
                                // Registrar eliminación en detalles
                                detailedResults.push({
                                    identification: identification || 'No proporcionada',
                                    email: email || 'No proporcionado',
                                    courseName: courseName,
                                    action: 'removed',
                                    status: 'success',
                                    message: 'Usuario eliminado del curso (NO APLICA)'
                                });
                                
                                successCount++;
                            }
                            // Si debe estar en el curso y ya está registrado
                            else if (shouldBeInCourse && existingClubUser) {
                                this.logger.log(`Usuario ID ${user.id} ya está registrado en el club ID ${currentClubId}`);
                                
                                // Registrar que ya estaba inscrito en detalles
                                detailedResults.push({
                                    identification: identification || 'No proporcionada',
                                    email: email || 'No proporcionado',
                                    courseName: courseName,
                                    action: 'already_registered',
                                    status: 'success',
                                    message: `Usuario ya registrado en el curso (${valueUpperCase})`
                                });
                                
                                successCount++;
                            }
                            // Si no debe estar en el curso y no está registrado
                            else if (valueUpperCase === 'NO APLICA' && !existingClubUser) {
                                this.logger.log(`Usuario ID ${user.id} no está registrado en el club ID ${currentClubId} - No se requiere acción (NO APLICA)`);
                                
                                // Registrar que no estaba inscrito y no se requiere acción
                                detailedResults.push({
                                    identification: identification || 'No proporcionada',
                                    email: email || 'No proporcionado',
                                    courseName: courseName,
                                    action: 'no_action',
                                    status: 'success',
                                    message: 'No se requiere acción (NO APLICA)'
                                });
                                
                                successCount++;
                            }
                        }
                    });
                } catch (error) {
                    errorCount++;
                    errors.push({
                        user: `Identificación: ${identification || 'No proporcionada'} - Correo: ${email || 'No proporcionado'}`,
                        course: 'Múltiples cursos',
                        error: `Error: ${error.message}`
                    });
                    this.logger.error(`Error procesando fila: ${error.message}`);
                    
                    // Registrar error en detalles
                    detailedResults.push({
                        identification: identification || 'No proporcionada',
                        email: email || 'No proporcionado',
                        courseName: 'Múltiples cursos',
                        action: 'error',
                        status: 'error',
                        message: error.message
                    });
                }
            }
    
            // Generar reporte Excel con los resultados detallados
            const reportWorkbook = XLSX.utils.book_new();
            
            // Crear hoja de resumen
            const summaryData = [
                ['Resumen del Proceso'],
                ['Total usuarios procesados', rows.length],
                ['Operaciones exitosas', successCount],
                ['Errores', errorCount],
                ['Usuarios no encontrados', usersNotFoundCount],
                ['Cursos no encontrados', countCoursesNotFound],
                ['Usuarios agregados a cursos', usersAddedToClub],
                ['Usuarios eliminados de cursos', usersRemovedFromClub],
                [''],
                ['Cursos no encontrados'],
                ...coursesNotFound.map(course => [course])
            ];
            
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(reportWorkbook, summarySheet, 'Resumen');
            
            // Crear hoja de detalles
            const detailsData = [
                ['Identificación', 'Correo', 'Curso', 'Acción', 'Estado', 'Mensaje']
            ];
            
            // Agregar todos los detalles
            detailedResults.forEach(result => {
                detailsData.push([
                    result.identification,
                    result.email,
                    result.courseName,
                    result.action,
                    result.status,
                    result.message
                ]);
            });
            
            const detailsSheet = XLSX.utils.aoa_to_sheet(detailsData);
            XLSX.utils.book_append_sheet(reportWorkbook, detailsSheet, 'Detalles');
            
            // Guardar el archivo de reporte
            const reportFilePath = `${filePath.split('.').slice(0, -1).join('.')}_reporte_club_user.xlsx`;
            this.logger.warn(`Archivo generado en: ${filePath.split('.').slice(0, -1).join('.')}_reporte_club_user.xlsx`)
            XLSX.writeFile(reportWorkbook, reportFilePath);
    
            // Eliminar archivo original después de procesar
            await unlink(filePath);
    
            return {
                message: 'Proceso completado',
                total: rows.length,
                success: successCount,
                errors: errorCount,
                errorDetails: errors,
                countCoursesNotFound: countCoursesNotFound,
                coursesNotFound: coursesNotFound,
                usersNotFound: usersNotFound,
                usersAddedToClub,
                usersRemovedFromClub,
                reportFilePath
            };
        } catch (error) {
            this.logger.error(`Error procesando archivo: ${error.message}`);
            throw new HttpException(
                `Error al procesar el archivo: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }


    async processSecondExcelFile(filePath: string, clubId?: number, clientId?: number): Promise<any> {
        try {
            // Leer el archivo Excel
            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    
            let successCount = 0;
            let errorCount = 0;
            let usersNotFoundCount = 0;
            let countCoursesNotFound = 0;
            let errors: { user: string; course: string; error: string }[] = [];
            let coursesNotFound: string[] = [];
            let usersNotFound: string[] = [];
            let usersAddedToClub = 0;
            let usersAlreadyInClub = 0;
            let progressCreated = 0;
            let progressUpdated = 0;
            let rowIndex = 1;
    
            const headers = rows.shift(); // Remueve la primera fila y la usa como encabezados
            const indexMap = headers.reduce((acc, header, index) => {
                acc[header.trim()] = index;
                return acc;
            }, {});
    
            // Identificar las columnas de cursos - son las que tienen "calificacion" en la siguiente columna
            const courseColumns: any[] = [];
            
            for (let i = 0; i < headers.length; i++) {
                const nextHeader = headers[i + 1];
                if (nextHeader && 
                    (nextHeader.toLowerCase().includes('calificacion') || 
                    nextHeader.toLowerCase().includes('calificación'))) {
                    courseColumns.push({
                        index: i,
                        name: headers[i].trim(),
                        calificacionIndex: i + 1,
                        fechaValidacionIndex: i + 2,
                        duracionIndex: i + 3
                    });
                    
                    this.logger.log(`Columna de curso detectada: ${headers[i].trim()} en índice: ${i}`);
                }
            }
            
            if (courseColumns.length === 0) {
                this.logger.error('No se pudieron encontrar columnas de cursos en el Excel');
                throw new HttpException('No se pudieron identificar columnas de cursos en el Excel', HttpStatus.BAD_REQUEST);
            }
            
            this.logger.log(`Total de columnas de cursos detectadas: ${courseColumns.length}`);
            for (const col of courseColumns) {
                this.logger.log(`Curso: ${col.name}, índices: ${JSON.stringify(col)}`);
            }
    
            // Procesar cada fila en una transacción
            for (const row of rows) {
                this.logger.warn(`Procesando fila ${rowIndex}...`);
                const identification = row[indexMap['CEDULA']?.toString().trim() || indexMap['NUMERO DE IDENTIFICACION']]?.toString().trim();
                const email = row[indexMap['CORREO']]?.toString().toLowerCase().trim();
                const userClientId = clientId || parseInt(row[indexMap['Client']], 10);
                
                const formatDateForMySQL = (date: Date) => {
                    // Verificar si la fecha es válida
                    if (isNaN(date.getTime())) {
                        // Si la fecha no es válida, devolver la fecha actual
                        return new Date().toISOString().slice(0, 19).replace("T", " ");
                    }
                    
                    // Verificar que la fecha no sea anterior a un límite razonable (ej: 1970)
                    if (date.getFullYear() < 1970) {
                        // Si la fecha es demasiado antigua, usar fecha actual
                        return new Date().toISOString().slice(0, 19).replace("T", " ");
                    }
                    
                    return date.toISOString().slice(0, 19).replace("T", " "); // Formato: 'YYYY-MM-DD HH:MM:SS'
                };
                
                const parseDate = (dateStr: string): string => {
                    if (!dateStr || dateStr.trim() === '') {
                        return formatDateForMySQL(new Date()); // Usar fecha actual si no hay fecha
                    }
                    
                    // Manejar casos especiales como '01/00/1900'
                    if (dateStr.includes('00/') || dateStr.includes('/00')) {
                        this.logger.log(`Fecha inválida detectada: ${dateStr}, usando fecha actual`);
                        return formatDateForMySQL(new Date());
                    }
                    
                    try {
                        let date: Date;
                        
                        // Comprobar si es formato DD/MM/YYYY
                        if (dateStr.includes('/')) {
                            const parts = dateStr.split('/').map(p => parseInt(p.trim(), 10));

                            // this.logger.log(parts);
                            
                            // Si alguna parte no es un número, usar fecha actual
                            if (parts.some(isNaN)) {
                                this.logger.log(`Formato de fecha inválido: ${dateStr}, usando fecha actual`);
                                return formatDateForMySQL(new Date());
                            }
                            
                            const [month, day, year] = parts;
                            
                            // Siempre asumir formato DD/MM/YYYY
                            date = new Date(year, month - 1, day);
                            
                            // Manejar años de 2 dígitos
                            if (year < 100) {
                                date.setFullYear(2000 + year);
                            }
                        } else if (dateStr.includes('-')) {
                            // Para formato con guiones, dividir y ordenar como DD/MM/YYYY
                            const parts = dateStr.split('-').map(p => parseInt(p.trim(), 10));
                            
                            if (parts.length === 3) {
                                // Asumir que viene como DD-MM-YYYY
                                const [day, month, year] = parts;
                                date = new Date(year, month - 1, day);
                                
                                // Manejar años de 2 dígitos
                                if (year < 100) {
                                    date.setFullYear(2000 + year);
                                }
                            } else {
                                // Si no tiene 3 partes, intentar parsear directamente
                                date = new Date(dateStr);
                            }
                        } else {
                            // Intentar parsear directamente
                            date = new Date(dateStr);
                        }
                        
                        // Verificar si la fecha resultante es válida
                        if (isNaN(date.getTime()) || date.getFullYear() < 1970) {
                            this.logger.log(`Fecha inválida después del parseo: ${dateStr}, usando fecha actual`);
                            return formatDateForMySQL(new Date());
                        }
                        
                        return formatDateForMySQL(date);
                    } catch (error) {
                        this.logger.error(`Error al parsear fecha ${dateStr}: ${error.message}`);
                        return formatDateForMySQL(new Date());
                    }
                };
                
                let firstProgressDate = formatDateForMySQL(new Date());  // Si no hay fecha específica, usar la fecha actual
                let lastProgressDate = formatDateForMySQL(new Date());
    
                try {
                    await this.dataSource.transaction(async (manager) => {
                        // Buscar usuario por identificación o correo
                        const whereConditions: any[] = [];

                        
                        if (identification) {
                            whereConditions.push({ identification: identification, client_id: userClientId });
                        }
                        
                        // if (email) {
                        //     whereConditions.push({ email: email, client_id: userClientId });
                        // }
                        
                        if (whereConditions.length === 0) {
                            throw new Error('Identificación o correo no proporcionados');
                        }
                        this.logger.warn(identification, userClientId);
                        
                        this.logger.warn(`--------------------------------------------------------------`);
                        // this.logger.warn(`${JSON.stringify(whereConditions)}`);
                        const user = await manager.getRepository(User).findOne({where: whereConditions});


                        this.logger.warn(user);

    
                        if (!user) {
                            usersNotFoundCount++;
                            usersNotFound.push(`Identificación: ${identification || 'No proporcionada'}`);
                            this.logger.warn(`Usuario no encontrado: ${identification || ''} / ${email || ''}`);
                            return; // Usar return en lugar de continue para salir de la transacción actual
                        }
    
                        // Procesar cada curso en la fila
                        for (const courseColumn of courseColumns) {
                            
                            // Mostrar información de debugging
                            this.logger.log(`Procesando curso: ${courseColumn.name}`);
                            
                            // Obtener el valor del curso (APROBADO/PENDIENTE/NO APLICA)
                            const courseValue = row[courseColumn.index]?.toString().trim();
                            
                            this.logger.log(`Valor del curso: ${courseValue}`);
                            
                            // Si es NO APLICA o está vacío, saltar este curso
                            if (!courseValue || courseValue === 'NO APLICA') {
                                this.logger.log(`Saltando curso ${courseColumn.name} porque es NO APLICA o vacío`);
                                continue;
                            }

                            let statusPending = false;
                            
                            // Verificar si está APROBADO o PENDIENTE
                            const isApproved = courseValue.toUpperCase() === 'APROBADO' || 
                                            courseValue.toUpperCase().includes('APROB') || 
                                            courseValue.toUpperCase() === 'PENDIENTE' || 
                                            courseValue.toUpperCase().includes('PENDI');

                            if (courseValue.toUpperCase() === 'PENDIENTE' || 
                            courseValue.toUpperCase().includes('PENDI')){
                                statusPending = true;
                            }
    
                            // Si no está aprobado o pendiente, saltar este curso
                            if (!isApproved) {
                                this.logger.log(`Saltando curso ${courseColumn.name} porque no está aprobado ni pendiente. Estado: ${courseValue}`);
                                continue;
                            }
    
                            const calificacionValue = row[courseColumn.calificacionIndex]?.toString().trim();
                            this.logger.log(`Calificación: ${calificacionValue}`);
                            
                            // Obtener fecha de validación si está disponible
                            let fechaValidacion = row[courseColumn.fechaValidacionIndex]?.toString().trim();
                            if (fechaValidacion) {
                                fechaValidacion = parseDate(fechaValidacion);
                                this.logger.log(`Fecha validación: ${fechaValidacion}, ${row[courseColumn.fechaValidacionIndex]?.toString().trim()}`);
                                firstProgressDate = fechaValidacion;
                                lastProgressDate = fechaValidacion;
                            }
    
                            // El courseName será el nombre de la columna
                            const courseName = courseColumn.name;
                            
                            // Buscar videoroom por nombre del curso
                            let videoRooms: VideoRoom[] = [];
                            let currentClubId: number | null = null;
                            
                            if (clubId) {
                                // Si se proporciona clubId, buscar todos los videorooms de ese club
                                currentClubId = clubId;
    
                                videoRooms = await manager.getRepository(VideoRoom).find({
                                    where: { club_id: clubId },
                                    relations: ['club']
                                });
                                
                                if (!videoRooms || videoRooms.length === 0) {
                                    this.logger.warn(`No se encontraron VideoRooms para el club_id: ${clubId}`);
                                    if (!coursesNotFound.includes(courseName)) {
                                        coursesNotFound.push(courseName);
                                    }
                                    continue;
                                }
                            } else {
                                // Primero intentar buscar coincidencia exacta del título del curso
                                const clubTranslation = await manager.getRepository(ClubTranslation).findOne({
                                    where: { title: courseName }
                                });
    
                                this.logger.log(`Búsqueda id de curso: ${clubTranslation?.club_id}`);
                                
                                // Si hay coincidencia exacta
                                if (clubTranslation) {
                                    currentClubId = clubTranslation.club_id;
                                    videoRooms = await manager.getRepository(VideoRoom).find({
                                        where: { club_id: clubTranslation.club_id },
                                        relations: ['club']
                                    });
                                } else {
                                    // Usar LIKE para buscar coincidencias parciales
                                    const partialMatches = await manager.query(`
                                        SELECT * FROM club_translations 
                                        WHERE title LIKE ? 
                                        LIMIT 1
                                    `, [`%${courseName}%`]);
                                    
                                    if (partialMatches && partialMatches.length > 0) {
                                        currentClubId = partialMatches[0].club_id;
                                        videoRooms = await manager.getRepository(VideoRoom).find({
                                            where: { club_id: partialMatches[0].club_id },
                                            relations: ['club']
                                        });
                                    }
                                }
    
                                if (!videoRooms || videoRooms.length === 0) {
                                    // Registrar que no se encontró el curso y continuar con el siguiente
                                    this.logger.warn(`No se encontró ningún VideoRoom para el curso: ${courseName}`);
                                    if (!coursesNotFound.includes(courseName)) {
                                        coursesNotFound.push(courseName);
                                        countCoursesNotFound++;
                                    }
                                    continue;
                                }
                            }
    
                            // NUEVA VALIDACIÓN: Verificar si el usuario ya está registrado en el club
                            // y si fue registrado después del 25 de marzo de 2025
                            if (currentClubId) {
                                const existingClubUser = await manager.getRepository(ClubUser).findOne({
                                    where: {
                                        club_id: currentClubId,
                                        user_id: user.id
                                    }
                                });
                                
                                // Si el usuario está registrado, verificar la fecha de registro
                                if (existingClubUser) {
                                    // Fecha límite: 25 de marzo de 2025
                                    const cutoffDate = new Date('2025-03-25');
                                    const registrationDate = new Date(existingClubUser.created_at);
                                    
                                    // Si el usuario fue registrado después de la fecha límite, saltar al siguiente curso
                                    if (registrationDate >= cutoffDate) {
                                        this.logger.log(`Usuario ID ${user.id} fue registrado en el club ID ${currentClubId} después del 25 de marzo de 2025. Saltando al siguiente curso.`);
                                        usersAlreadyInClub++;

                                        for (const videoRoom of videoRooms) {
                                            // NUEVA VALIDACIÓN: Verificar si ya existe progreso general para este videoroom
                                            const existingProgress2 = await this.generalProgressVideoroomsRepository.findOne({
                                                where: { id_user: user.id, id_videoroom: videoRoom.id },
                                            });

                                            if(existingProgress2){
                                                existingProgress2.created_at = firstProgressDate;
                                                existingProgress2.updated_at = lastProgressDate;
                                                await this.generalProgressVideoroomsRepository.save(existingProgress2);
                                                continue; // Saltar al siguiente curso
                                            }
                                        }
                                    }
                                    this.logger.log(`Usuario ID ${user.id} ya está registrado en el club ID ${currentClubId}`);
                                    usersAlreadyInClub++;
                                } else {
                                    // Si el usuario no está registrado, agregarlo
                                    this.logger.log(`Agregando usuario ID ${user.id} al club ID ${currentClubId}`);
                                    
                                    const newClubUser = new ClubUser();
                                    newClubUser.club_id = currentClubId;
                                    newClubUser.user_id = user.id;
                                    
                                    await manager.getRepository(ClubUser).save(newClubUser);
                                    usersAddedToClub++;
                                    
                                    this.logger.log(`Usuario ID ${user.id} agregado exitosamente al club ID ${currentClubId}`);
                                }
                            }

                            
                            if(statusPending == true){
                                // this.logger.warn(`estado ${statusPending}`);
                                for (const videoRoom of videoRooms) {

                                    this.logger.warn(`Se busca progreso para ${videoRoom.id} del usuario ${user.id}`);

                                    // NUEVA VALIDACIÓN: Verificar si ya existe progreso general para este videoroom
                                    const existingProgress = await this.generalProgressVideoroomsRepository.findOne({
                                        where: { id_user: user.id, id_videoroom: videoRoom.id },
                                    });
        
                                    if (existingProgress) {
                                        let notaCalificacion = 0;
                                        // Solo actualizar fechas en el registro existente
                                        existingProgress.porcen = null;
                                        existingProgress.created_at = firstProgressDate;
                                        existingProgress.updated_at = lastProgressDate;
                                        await this.generalProgressVideoroomsRepository.save(existingProgress);

                                        // Buscar y procesar encuestas
                                        this.logger.log(`Se buscan encuestas`);
                                        const pollsDetails = await this.videoRoomRepository.find({
                                            where: { id: videoRoom.id, id_polls: Not(IsNull()) }
                                        });
            
                                        // this.logger.log(`Encuestas encontradas: ${JSON.stringify(pollsDetails)}`);
            
                                        for (const poll of pollsDetails) {
                                            const nota = notaCalificacion;
                                            
                                            // Verificar si ya existe progreso para esta evaluación
                                            const [existingEvalProgress] = await manager.query(`
                                                SELECT * FROM user_pogress_evaluation_video_rooms 
                                                WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                            `, [user.id, videoRoom.id, poll.id_polls]);
                                            
                                            if (existingEvalProgress) {
                                                // Solo actualizar fechas
                                                await manager.query(`
                                                    UPDATE user_pogress_evaluation_video_rooms 
                                                    SET updated_at = ?, created_at = ? 
                                                    WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                                `, [lastProgressDate, firstProgressDate, user.id, videoRoom.id, poll.id_polls]);
                                            } else {
                                                // Crear nuevo registro
                                                await manager.query(`
                                                    INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen, created_at, updated_at)
                                                    VALUES (?, ?, ?, ?, ?, ?)
                                                `, [user.id, videoRoom.id, poll.id_polls, nota, firstProgressDate, lastProgressDate]);
                                            }
                                            
                                            const [evaluation] = await manager.query(`
                                                SELECT * FROM evaluations WHERE id = ?
                                            `, [poll.id_polls]);
                                            
                                            if (evaluation) {
                                                const maxAttempts = evaluation.attempts || Number.MAX_SAFE_INTEGER;
                                            
                                                // Verificar si ya existe un intento
                                                const [existingAttempt] = await manager.query(`
                                                    SELECT * FROM evaluation_users 
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [user.id, poll.id_polls]);
                                                
                                                const [existingAttemptsCount] = await manager.query(`
                                                    SELECT COUNT(*) as count FROM evaluation_users 
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [user.id, poll.id_polls]);
                                            
                                                if (existingAttempt) {
                                                    // Solo actualizar fechas si ya existe
                                                    await manager.query(`
                                                        UPDATE evaluation_users 
                                                        SET updated_at = ?, created_at = ?, nota = ?, approved = 0 
                                                        WHERE user_id = ? AND evaluation_id = ?
                                                    `, [lastProgressDate, firstProgressDate, 0, user.id, poll.id_polls]);
                                                } else if (existingAttemptsCount.count < maxAttempts) {
                                                    // Crear nuevo registro solo si no se excede el máximo de intentos
                                                    await manager.query(`
                                                        INSERT INTO evaluation_users (user_id, evaluation_id, created_at, updated_at, nota, approved, intentos)
                                                        VALUES (?, ?, ?, ?, ?, 0, 1)
                                                    `, [user.id, poll.id_polls, firstProgressDate, lastProgressDate, nota]);
                                                }
                                            }
                                        }
            
                                        // Obtener detalles de evaluación
                                        const evaluationDetails = await manager.query(`
                                            SELECT id_evaluation FROM detail_evaluation_video_rooms WHERE id_videoroom = ?
                                        `, [videoRoom.id]);
                
                                        // Procesar cada evaluación
                                        for (const evalDetail of evaluationDetails) {
                                            // Determinar la nota (calificación del Excel o 100 por defecto)
                                            const nota = notaCalificacion;
                                            
                                            // Verificar si ya existe progreso para esta evaluación
                                            const existingEvalProgress = await manager.query(`
                                                SELECT * FROM user_pogress_evaluation_video_rooms 
                                                WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                            `, [user.id, videoRoom.id, evalDetail.id_evaluation]);
                                            
                                            if (existingEvalProgress.length > 0) {
                                                // Solo actualizar fechas
                                                await manager.query(`
                                                    UPDATE user_pogress_evaluation_video_rooms 
                                                    SET updated_at = ?, created_at = ?, porcen = ?
                                                    WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                                `, [lastProgressDate, firstProgressDate, 0, user.id, videoRoom.id, evalDetail.id_evaluation]);
                                            }
                
                                            // Obtener evaluación para verificar configuraciones
                                            const evaluation = await manager.query(`
                                                SELECT * FROM evaluations WHERE id = ?
                                            `, [evalDetail.id_evaluation]);
                
                                            if (evaluation?.length > 0) {
                                                const maxAttempts = evaluation[0].attempts || Number.MAX_SAFE_INTEGER;
                
                                                // Verificar si ya existe un intento
                                                const existingAttempt = await manager.query(`
                                                    SELECT * FROM evaluation_users 
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [user.id, evalDetail.id_evaluation]);
                                                
                                                // Verificar intentos actuales
                                                const existingAttempts = await manager.query(`
                                                    SELECT COUNT(*) as count FROM evaluation_users 
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [user.id, evalDetail.id_evaluation]);
                
                                                if (existingAttempt.length > 0) {
                                                    // Actualizar evaluation_users
                                                    await manager.query(`
                                                        UPDATE evaluation_users 
                                                        SET updated_at = ?, created_at = ?, nota = ?, approved = 0
                                                        WHERE user_id = ? AND evaluation_id = ?
                                                    `, [lastProgressDate, firstProgressDate, 0, user.id, evalDetail.id_evaluation]);

                                                    const existingHistory = await manager.query(`
                                                        SELECT COUNT(*) as count FROM evaluation_history 
                                                        WHERE user_id = ? AND evaluation_id = ?
                                                    `, [user.id, evalDetail.id_evaluation]);

                                                    if(existingHistory.length > 0){

                                                        await manager.query(`
                                                            UPDATE evaluation_history 
                                                            SET updated_at = ?, created_at = ?, nota = ?, approved = 0 
                                                            WHERE user_id = ? AND evaluation_id = ?
                                                        `, [lastProgressDate, firstProgressDate, 0, user.id, evalDetail.id_evaluation]);
                                                    }
                                                    
                                                } else if (existingAttempts[0].count < maxAttempts) {
                                                    // Crear nuevo registro solo si no se excede el máximo de intentos
                                                    await manager.query(`
                                                        INSERT INTO evaluation_users (user_id, evaluation_id, created_at, updated_at, nota, approved, intentos)
                                                        VALUES (?, ?, ?, ?, ?, 0, 1)
                                                    `, [user.id, evalDetail.id_evaluation, firstProgressDate, lastProgressDate, nota]);


                                                    const existingHistory = await manager.query(`
                                                        SELECT COUNT(*) as count FROM evaluation_history 
                                                        WHERE user_id = ? AND evaluation_id = ?
                                                    `, [user.id, evalDetail.id_evaluation]);

                                                    if(existingHistory.length > 0){
                                                        // this.logger.log('Se actualizan fechas en historial de evaluacion');
                                                        await manager.query(`
                                                            UPDATE evaluation_history 
                                                            SET updated_at = ?, created_at = ?, nota = ?, approved = 0 
                                                            WHERE user_id = ? AND evaluation_id = ?
                                                        `, [lastProgressDate, firstProgressDate, 0, user.id, evalDetail.id_evaluation]);
                                                    }
                                                    
                                                }
                                            }
                                        }

                                        // this.logger.warn(`El usuario ${user.id} es Pendiente se elimina progreso en ${videoRoom.id}`)
                                    } 
                                }
                                this.logger.warn(`El usuario ${user.id} es Pendiente por lo que no se no creara progreso`)
                                continue;
                            }
    
                            // Convertir calificación a número si existe
                            let notaCalificacion = 0; // Valor por defecto
                            if (calificacionValue) {
                                const numMatch = calificacionValue.match(/\d+(\.\d+)?/);
                                if (numMatch) {
                                    notaCalificacion = parseFloat(numMatch[0]);
                                }
                                this.logger.log(`Nota calificación procesada: ${notaCalificacion}`);
                            }
    
                            this.logger.log(`Encontrados ${videoRooms.length} VideoRooms para el curso: ${courseName}`);
    
                            // Procesar cada videoRoom asociado al curso/club
                            for (const videoRoom of videoRooms) {
                                // NUEVA VALIDACIÓN: Verificar si ya existe progreso general para este videoroom
                                const existingProgress = await this.generalProgressVideoroomsRepository.findOne({
                                    where: { id_user: user.id, id_videoroom: videoRoom.id },
                                });
    
                                if (existingProgress) {
                                    // Solo actualizar fechas en el registro existente
                                    existingProgress.created_at = firstProgressDate;
                                    existingProgress.updated_at = lastProgressDate;
                                    await this.generalProgressVideoroomsRepository.save(existingProgress);
                                    // this.logger.log(`Se actualizan fechas para el videoroom: ${existingProgress.id_videoroom}`);
                                    progressUpdated++;
                                } else {
                                    // Crear un nuevo registro de progreso
                                    await this.generalProgressVideoroomsRepository.save({
                                        id_user: user.id,
                                        id_videoroom: videoRoom.id,
                                        porcen: 100,
                                        created_at: firstProgressDate,
                                        updated_at: lastProgressDate,
                                    });
                                    // this.logger.log(`Se crea nuevo registro para el videoroom: ${videoRoom.id}`);
                                    progressCreated++;
                                }
        
                                // Obtener los contenidos del videoroom
                                const videoRoomContents = await manager.query(`
                                    SELECT content_id FROM videoroom_content WHERE videoroom_id = ?
                                `, [videoRoom.id]);
        
                                // Actualizar progreso para cada contenido
                                for (const content of videoRoomContents) {
                                    const existingProgressVideoroom = await this.userProgressVideoroomRepository.findOne({
                                        where: { id_content: content.content_id, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressVideoroom) {
                                        // Solo actualizar fechas en el registro existente
                                        existingProgressVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressVideoroomRepository.save(existingProgressVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressVideoroomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_content: content.content_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Obtener detalles de las tareas asociadas al videoroom
                                const taskDetails = await manager.query(`
                                    SELECT tasks_id FROM detail_tasks_videorooms WHERE videorooms_id = ?
                                `, [videoRoom.id]);
        
                                // Actualizar progreso para cada tarea
                                for (const task of taskDetails) {
                                    const existingProgressTaskVideoroom = await this.userProgressTaskVideoroomRepository.findOne({
                                        where: { id_task: task.tasks_id, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressTaskVideoroom) {
                                        // Solo actualizar fechas en el registro existente
                                        existingProgressTaskVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressTaskVideoroomRepository.save(existingProgressTaskVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressTaskVideoroomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_task: task.tasks_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Actualizar o crear progreso para cada muro
                                const wallsDetails = await this.detailWallsVideoRoomRepository.find({
                                    where: { videorooms_id: videoRoom.id },
                                });
                                
                                for (const wall of wallsDetails) {
                                    const existingProgressWallVideoroom = await this.userProgressForumVideoRoomRepository.findOne({
                                        where: { id_advertisements: wall.advertisements_id, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressWallVideoroom) {
                                        // Solo actualizar fechas en el registro existente
                                        existingProgressWallVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressForumVideoRoomRepository.save(existingProgressWallVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressForumVideoRoomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_advertisements: wall.advertisements_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Actualizar o crear progreso para cada actividad
                                const activityDetails = await this.detailActivitiesVideoRoomRepository.find({
                                    where: { id_videoroom: videoRoom.id },
                                });
        
                                for (const activity of activityDetails) {
                                    const existingProgressActivitesVideoroom = await this.userProgressActivityVideoRoomRepository.findOne({
                                        where: { id_activity: activity.id_activities, id_user: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressActivitesVideoroom) {
                                        // Solo actualizar fechas en el registro existente
                                        existingProgressActivitesVideoroom.updated_at = lastProgressDate;
                                        await this.userProgressActivityVideoRoomRepository.save(existingProgressActivitesVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressActivityVideoRoomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_activity: activity.id_activities,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
        
                                // Actualizar o crear progreso para cada autoevaluación
                                const selftEvaluationDetails = await this.detailSelftEvaluationVideoRoomRepository.find({
                                    where: { id_videoroom: videoRoom.id },
                                });
                                
                                for (const selftEvaluation of selftEvaluationDetails) {
                                    const existingProgressSelftEvaluationVideoroom = await this.userProgressSelftEvaluationVideoRoomRepository.findOne({
                                        where: { selft_evaluations_id: selftEvaluation.selft_evaluations_id, user_id: user.id, id_videoroom: videoRoom.id},
                                    });
        
                                    if (existingProgressSelftEvaluationVideoroom) {
                                        // Solo actualizar fechas en el registro existente
                                        existingProgressSelftEvaluationVideoroom.updated_at = lastProgressDate;
                                        existingProgressSelftEvaluationVideoroom.created_at = firstProgressDate;
                                        await this.userProgressSelftEvaluationVideoRoomRepository.save(existingProgressSelftEvaluationVideoroom);
                                    } else {
                                        // Crear un nuevo registro
                                        await this.userProgressSelftEvaluationVideoRoomRepository.save({
                                            porcen: 100,
                                            id_user: user.id,
                                            id_videoroom: videoRoom.id,
                                            id_advertisements: selftEvaluation.selft_evaluations_id,
                                            created_at: firstProgressDate,
                                            updated_at: lastProgressDate,
                                        });
                                    }
                                }
    
                                // Buscar y procesar encuestas
                                // this.logger.log(`Se buscan encuestas`);
                                const pollsDetails = await this.videoRoomRepository.find({
                                    where: { id: videoRoom.id, id_polls: Not(IsNull()) }
                                });
    
                                // this.logger.log(`Encuestas encontradas: ${JSON.stringify(pollsDetails)}`);
    
                                for (const poll of pollsDetails) {
                                    const nota = notaCalificacion;
                                    
                                    // Verificar si ya existe progreso para esta evaluación
                                    const [existingEvalProgress] = await manager.query(`
                                        SELECT * FROM user_pogress_evaluation_video_rooms 
                                        WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                    `, [user.id, videoRoom.id, poll.id_polls]);
                                    
                                    if (existingEvalProgress) {
                                        // Solo actualizar fechas
                                        await manager.query(`
                                            UPDATE user_pogress_evaluation_video_rooms 
                                            SET updated_at = ?, created_at = ? 
                                            WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                        `, [lastProgressDate, firstProgressDate, user.id, videoRoom.id, poll.id_polls]);
                                    } else {
                                        // Crear nuevo registro
                                        await manager.query(`
                                            INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen, created_at, updated_at)
                                            VALUES (?, ?, ?, ?, ?, ?)
                                        `, [user.id, videoRoom.id, poll.id_polls, nota, firstProgressDate, lastProgressDate]);
                                    }
                                    
                                    const [evaluation] = await manager.query(`
                                        SELECT * FROM evaluations WHERE id = ?
                                    `, [poll.id_polls]);
                                    
                                    if (evaluation) {
                                        const maxAttempts = evaluation.attempts || Number.MAX_SAFE_INTEGER;
                                    
                                        // Verificar si ya existe un intento
                                        const [existingAttempt] = await manager.query(`
                                            SELECT * FROM evaluation_users 
                                            WHERE user_id = ? AND evaluation_id = ?
                                        `, [user.id, poll.id_polls]);
                                        
                                        const [existingAttemptsCount] = await manager.query(`
                                            SELECT COUNT(*) as count FROM evaluation_users 
                                            WHERE user_id = ? AND evaluation_id = ?
                                        `, [user.id, poll.id_polls]);
                                    
                                        if (existingAttempt) {
                                            // Solo actualizar fechas si ya existe
                                            await manager.query(`
                                                UPDATE evaluation_users 
                                                SET updated_at = ?, created_at = ? 
                                                WHERE user_id = ? AND evaluation_id = ?
                                              `, [lastProgressDate, firstProgressDate, user.id, poll.id_polls]);
                                              
                                              // Selecciona el registro actualizado
                                              const updatedRow = await manager.query(`
                                                SELECT * FROM evaluation_users 
                                                WHERE user_id = ? AND evaluation_id = ?
                                              `, [user.id, poll.id_polls]);
                                              
                                            // this.logger.log(`Datos actualizados en evaluation_users: ${JSON.stringify(updatedRow)}`);

                                            // Obtener preguntas y crear respuestas solo para nuevos intentos
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                            `, [poll.id_polls]);
                                            
                                            for (const question of questions) {
                                                // Verificar si ya existe una respuesta
                                                const [existingAnswer] = await manager.query(`
                                                    SELECT * FROM answers 
                                                    WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                `, [poll.id_polls, question.id, user.id]);

                                                // if (existingAnswer) {
                                                //     this.logger.log(`Respuestas existentes: ${existingAnswer.length}`);
                                                // } else {
                                                //     this.logger.warn(`No se pudo obtener las respuestas existentes.`);
                                                // }
                                                
                                                if (!existingAnswer) {
                                                    if (question.type === 'open_answer') {
                                                        await manager.query(`
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                            VALUES (?, ?, NULL, ?, 'Homologacion', ?, ?)
                                                        `, [poll.id_polls, question.id, user.id, firstProgressDate, lastProgressDate]);
                                                    } else {
                                                        let [option] = await manager.query(`
                                                            SELECT * FROM options WHERE question_id = ? AND correct = 1 LIMIT 1
                                                        `, [question.id]);
                                        
                                                        if (!option) {
                                                            [option] = await manager.query(`
                                                                SELECT id FROM options WHERE question_id = ? LIMIT 1
                                                            `, [question.id]);
                                                        }
                                        
                                                        if (option) {
                                                            await manager.query(`
                                                                INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                                VALUES (?, ?, ?, ?, NULL, ?, ?)
                                                            `, [poll.id_polls, question.id, option.id, user.id, firstProgressDate, lastProgressDate]);
                                                        }
                                                    }
                                                }else if (existingAnswer){
                                                    // this.logger.log(`Se en cuentran answers para la encuesta: ${poll.id_polls}, question: ${question.id} y se actualizan fechas`);

                                                    // Actualizar las fechas de las respuestas existentes
                                                    await manager.query(`
                                                        UPDATE answers 
                                                        SET updated_at = ?, created_at = ? 
                                                        WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                    `, [lastProgressDate, firstProgressDate, poll.id_polls, question.id, user.id]);
                                                }
                                            }
                                        } else if (existingAttemptsCount.count < maxAttempts) {
                                            // Crear nuevo registro solo si no se excede el máximo de intentos
                                            await manager.query(`
                                                INSERT INTO evaluation_users (user_id, evaluation_id, created_at, updated_at, nota, approved, intentos)
                                                VALUES (?, ?, ?, ?, ?, 1, 1)
                                            `, [user.id, poll.id_polls, firstProgressDate, lastProgressDate, nota]);
                                            
                                            
                                            // Obtener preguntas y crear respuestas solo para nuevos intentos
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                            `, [poll.id_polls]);
                                            
                                            for (const question of questions) {
                                                // Verificar si ya existe una respuesta
                                                const [existingAnswer] = await manager.query(`
                                                    SELECT * FROM answers 
                                                    WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                `, [poll.id_polls, question.id, user.id]);

                                                // if (existingAnswer) {
                                                //     this.logger.log(`Respuestas existentes 2: ${existingAnswer.length}`);
                                                // } else {
                                                //     this.logger.warn(`No se pudo obtener las respuestas existentes 2.`);
                                                // }
                                                
                                                if (!existingAnswer) {
                                                    if (question.type === 'open_answer') {
                                                        await manager.query(`
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                            VALUES (?, ?, NULL, ?, 'Homologacion', ?, ?)
                                                        `, [poll.id_polls, question.id, user.id, firstProgressDate, lastProgressDate]);
                                                    } else {
                                                        let [option] = await manager.query(`
                                                            SELECT * FROM options WHERE question_id = ? AND correct = 1 LIMIT 1
                                                        `, [question.id]);
                                        
                                                        if (!option) {
                                                            [option] = await manager.query(`
                                                                SELECT id FROM options WHERE question_id = ? LIMIT 1
                                                            `, [question.id]);
                                                        }
                                        
                                                        if (option) {
                                                            await manager.query(`
                                                                INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                                VALUES (?, ?, ?, ?, NULL, ?, ?)
                                                            `, [poll.id_polls, question.id, option.id, user.id, firstProgressDate, lastProgressDate]);
                                                        }
                                                    }
                                                }else if (existingAnswer){
                                                    // this.logger.log(`Se en cuentran answers para la encuesta: ${poll.id_polls}, question: ${question.id}`);

                                                    // Actualizar las fechas de las respuestas existentes
                                                    await manager.query(`
                                                        UPDATE answers 
                                                        SET updated_at = ?, created_at = ? 
                                                        WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                    `, [lastProgressDate, firstProgressDate, poll.id_polls, question.id, user.id]);
                                                }
                                            }
                                        }
                                    }
                                }
    
                                // Obtener detalles de evaluación
                                const evaluationDetails = await manager.query(`
                                    SELECT id_evaluation FROM detail_evaluation_video_rooms WHERE id_videoroom = ?
                                `, [videoRoom.id]);
        
                                // Procesar cada evaluación
                                for (const evalDetail of evaluationDetails) {
                                    // Determinar la nota (calificación del Excel o 100 por defecto)
                                    const nota = notaCalificacion;
                                    
                                    // Verificar si ya existe progreso para esta evaluación
                                    const existingEvalProgress = await manager.query(`
                                        SELECT * FROM user_pogress_evaluation_video_rooms 
                                        WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                    `, [user.id, videoRoom.id, evalDetail.id_evaluation]);
                                    
                                    if (existingEvalProgress.length > 0) {
                                        // Solo actualizar fechas
                                        await manager.query(`
                                            UPDATE user_pogress_evaluation_video_rooms 
                                            SET updated_at = ?, created_at = ? 
                                            WHERE id_user = ? AND id_videoroom = ? AND id_evaluation = ?
                                        `, [lastProgressDate, firstProgressDate, user.id, videoRoom.id, evalDetail.id_evaluation]);
                                    } else {
                                        // Crear nuevo registro
                                        await manager.query(`
                                            INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen, created_at, updated_at)
                                            VALUES (?, ?, ?, ?, ?, ?)
                                        `, [user.id, videoRoom.id, evalDetail.id_evaluation, nota, firstProgressDate, lastProgressDate]);
                                    }
        
                                    // Obtener evaluación para verificar configuraciones
                                    const evaluation = await manager.query(`
                                        SELECT * FROM evaluations WHERE id = ?
                                    `, [evalDetail.id_evaluation]);
        
                                    if (evaluation?.length > 0) {
                                        const maxAttempts = evaluation[0].attempts || Number.MAX_SAFE_INTEGER;
        
                                        // Verificar si ya existe un intento
                                        const existingAttempt = await manager.query(`
                                            SELECT * FROM evaluation_users 
                                            WHERE user_id = ? AND evaluation_id = ?
                                        `, [user.id, evalDetail.id_evaluation]);
                                        
                                        // Verificar intentos actuales
                                        const existingAttempts = await manager.query(`
                                            SELECT COUNT(*) as count FROM evaluation_users 
                                            WHERE user_id = ? AND evaluation_id = ?
                                        `, [user.id, evalDetail.id_evaluation]);
        
                                        if (existingAttempt.length > 0) {
                                            // Actualizar evaluation_users
                                            await manager.query(`
                                                UPDATE evaluation_users 
                                                SET updated_at = ?, created_at = ? 
                                                WHERE user_id = ? AND evaluation_id = ?
                                            `, [lastProgressDate, firstProgressDate, user.id, evalDetail.id_evaluation]);

                                            const existingHistory = await manager.query(`
                                                SELECT COUNT(*) as count FROM evaluation_history 
                                                WHERE user_id = ? AND evaluation_id = ?
                                            `, [user.id, evalDetail.id_evaluation]);

                                            if(existingHistory.length > 0){

                                                await manager.query(`
                                                    UPDATE evaluation_history 
                                                    SET updated_at = ?, created_at = ? 
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [lastProgressDate, firstProgressDate, user.id, evalDetail.id_evaluation]);
                                            }else{
                                                // También registrar en el historial cada vez que hay una actualización
                                                await manager.query(`
                                                    INSERT INTO evaluation_history (evaluation_id, user_id, nota, created_at, updated_at, approved)
                                                    VALUES (?, ?, ?, ?, ?, 1)
                                                `, [evalDetail.id_evaluation, user.id, nota, firstProgressDate, lastProgressDate]);
                                            }
                                            

                                            // Obtener preguntas y crear respuestas solo para nuevos intentos
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                            `, [evalDetail.id_evaluation]);
        
                                            for (const question of questions) {
                                                                                            // Verificar si ya existe una respuesta
                                                const existingAnswer = await manager.query(`
                                                    SELECT * FROM answers 
                                                    WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                `, [evalDetail.id_evaluation, question.id, user.id]);

                                                // if (existingAnswer) {
                                                //     this.logger.log(`Respuestas existentes 3: ${existingAnswer.length}`);
                                                // } else {
                                                //     this.logger.warn(`No se pudo obtener las respuestas existentes 3.`);
                                                // }
                                                
                                                if (existingAnswer.length === 0) {
                                                    if (question.type === 'open_answer') {
                                                        await manager.query(`
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at. updated_at)
                                                            VALUES (?, ?, NULL, ?, 'Homologacion', ?, ?)
                                                        `, [evalDetail.id_evaluation, question.id, user.id, firstProgressDate, lastProgressDate]);
                                                    } else {
                                                        // Obtener primera opción correcta
                                                        const option = await manager.query(`
                                                            SELECT * FROM options 
                                                            WHERE question_id = ? AND correct = 1
                                                            LIMIT 1
                                                        `, [question.id]);
                        
                                                        // Si no hay opción correcta, obtener la primera
                                                        const optionId = option.length > 0
                                                            ? option[0].id
                                                            : (await manager.query(`
                                                            SELECT id FROM options 
                                                            WHERE question_id = ? 
                                                            LIMIT 1
                                                        `, [question.id]))[0]?.id;
                        
                                                        if (optionId) {
                                                            await manager.query(`
                                                                INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                                VALUES (?, ?, ?, ?, NULL, ?, ?)
                                                            `, [evalDetail.id_evaluation, question.id, optionId, user.id, firstProgressDate, lastProgressDate]);
                                                        }
                                                    }
                                                }else if (existingAnswer.length != 0){

                                                    // this.logger.log(`Se actualizan fechas de answers de evaluacion`);

                                                    // Actualizar las fechas de las respuestas existentes
                                                    await manager.query(`
                                                        UPDATE answers 
                                                        SET updated_at = ?, created_at = ? 
                                                        WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                    `, [lastProgressDate, firstProgressDate, evalDetail.id_evaluation, question.id, user.id]);
                                                }
                                            }
                                        } else if (existingAttempts[0].count < maxAttempts) {
                                            // Crear nuevo registro solo si no se excede el máximo de intentos
                                            await manager.query(`
                                                INSERT INTO evaluation_users (user_id, evaluation_id, created_at, updated_at, nota, approved, intentos)
                                                VALUES (?, ?, ?, ?, ?, 1, 1)
                                            `, [user.id, evalDetail.id_evaluation, firstProgressDate, lastProgressDate, nota]);


                                            const existingHistory = await manager.query(`
                                                SELECT COUNT(*) as count FROM evaluation_history 
                                                WHERE user_id = ? AND evaluation_id = ?
                                            `, [user.id, evalDetail.id_evaluation]);

                                            if(existingHistory.length > 0){
                                                // this.logger.log('Se actualizan fechas en historial de evaluacion');
                                                await manager.query(`
                                                    UPDATE evaluation_history 
                                                    SET updated_at = ?, created_at = ? 
                                                    WHERE user_id = ? AND evaluation_id = ?
                                                `, [lastProgressDate, firstProgressDate, user.id, evalDetail.id_evaluation]);
                                            }else{
                                                // this.logger.log('Se crea historial de evaluacion');
                                                // Siempre registrar en el historial
                                                await manager.query(`
                                                    INSERT INTO evaluation_history (evaluation_id, user_id, nota, created_at, updated_at, approved)
                                                    VALUES (?, ?, ?, ?, ?, 1)
                                                `, [evalDetail.id_evaluation, user.id, nota, firstProgressDate, lastProgressDate]);
                                            }
                                            
        
                                            // Obtener preguntas y crear respuestas solo para nuevos intentos
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                            `, [evalDetail.id_evaluation]);
        
                                            for (const question of questions) {
                                                                                            // Verificar si ya existe una respuesta
                                                const existingAnswer = await manager.query(`
                                                    SELECT * FROM answers 
                                                    WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                `, [evalDetail.id_evaluation, question.id, user.id]);

                                                // if (existingAnswer) {
                                                //     this.logger.log(`Respuestas existentes 4: ${existingAnswer.length}`);
                                                // } else {
                                                //     this.logger.warn(`No se pudo obtener las respuestas existentes 4.`);
                                                // }
                                                
                                                if (existingAnswer.length === 0) {
                                                    if (question.type === 'open_answer') {
                                                        await manager.query(`
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at. updated_at)
                                                            VALUES (?, ?, NULL, ?, 'Homologacion', ?, ?)
                                                        `, [evalDetail.id_evaluation, question.id, user.id, firstProgressDate, lastProgressDate]);
                                                    } else {
                                                        // Obtener primera opción correcta
                                                        const option = await manager.query(`
                                                            SELECT * FROM options 
                                                            WHERE question_id = ? AND correct = 1
                                                            LIMIT 1
                                                        `, [question.id]);
                        
                                                        // Si no hay opción correcta, obtener la primera
                                                        const optionId = option.length > 0
                                                            ? option[0].id
                                                            : (await manager.query(`
                                                            SELECT id FROM options 
                                                            WHERE question_id = ? 
                                                            LIMIT 1
                                                        `, [question.id]))[0]?.id;
                        
                                                        if (optionId) {
                                                            await manager.query(`
                                                                INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content, created_at, updated_at)
                                                                VALUES (?, ?, ?, ?, NULL, ?, ?)
                                                            `, [evalDetail.id_evaluation, question.id, optionId, user.id, firstProgressDate, lastProgressDate]);
                                                        }
                                                    }
                                                }else if (existingAnswer.length != 0){

                                                    // this.logger.log(`Se actualizan fechas de answrs`);

                                                    // Actualizar las fechas de las respuestas existentes
                                                    await manager.query(`
                                                        UPDATE answers 
                                                        SET updated_at = ?, created_at = ?
                                                        WHERE evaluation_id = ? AND question_id = ? AND user_id = ?
                                                    `, [lastProgressDate, firstProgressDate, evalDetail.id_evaluation, question.id, user.id]);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            successCount++;
                        }
                    });
                } catch (error) {
                    errorCount++;
                    errors.push({
                        user: `Identificación: ${identification || 'No proporcionada'} - Correo: ${email || 'No proporcionado'}`,
                        course: 'Múltiples cursos',
                        error: `Error: ${error.message}`
                    });
                    this.logger.error(`Error en fila ${rowIndex}: ${error.message}`);
                }
                rowIndex++;
            }
    
            // Eliminar archivo después de procesar
            await unlink(filePath);

            this.logger.warn({
                message: 'Proceso completado',
                total: rows.length,
                success: successCount,
                errors: errorCount,
                errorDetails: errors,
                countCoursesNotFound: countCoursesNotFound,
                coursesNotFound: coursesNotFound,
                usersNotFoundCount: usersNotFoundCount,
                usersNotFound: usersNotFound,
                usersAddedToClub,
                usersAlreadyInClub,
                progressCreated,
                progressUpdated
            });

            const folderPath = path.join(__dirname, '..', '..', 'uploads', 'clubs_not_found');
                if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            const workbook2 = new ExcelJS.Workbook();
            const worksheet2 = workbook2.addWorksheet('Cursos No Encontrados');

            worksheet2.columns = [
            { header: 'Curso No Encontrado', key: 'name', width: 50 }
            ];

            coursesNotFound.forEach(course => {
                worksheet2.addRow({ name: course });
            });

            // Hoja 2: Usuarios no encontrados (si hay alguno)
            if (usersNotFound && usersNotFound.length > 0) {
                const worksheetUsers = workbook2.addWorksheet('Usuarios No Encontrados');
                worksheetUsers.columns = [
                    { header: 'Detalle', key: 'detail', width: 60 }
                ];
                usersNotFound.forEach(detail => {
                    worksheetUsers.addRow({ detail });
                });
            }

            const filePathExcel = path.join(folderPath, `courses_not_found_${Date.now()}.xlsx`);
            await workbook2.xlsx.writeFile(filePathExcel);

            this.logger.log(`Archivo Excel generado: ${filePathExcel}`);
    
            return {
                message: 'Proceso completado',
                total: rows.length,
                success: successCount,
                errors: errorCount,
                errorDetails: errors,
                countCoursesNotFound: countCoursesNotFound,
                coursesNotFound: coursesNotFound,
                usersNotFoundCount: usersNotFoundCount,
                usersNotFound: usersNotFound,
                usersAddedToClub,
                usersAlreadyInClub,
                progressCreated,
                progressUpdated
            };
        } catch (error) {
            this.logger.error(`Error procesando archivo: ${error.message}`);
            throw new HttpException(
                `Error al procesar el archivo: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}