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
                    return date.toISOString().slice(0, 19).replace("T", " "); // Formato: 'YYYY-MM-DD HH:MM:SS'
                };
                const parseDate = (dateStr: string): string => {
                    if (!dateStr) return new Date().toISOString().slice(0, 19).replace('T', ' '); 
                
                    const [month, day, year] = dateStr.split('/').map(Number); 
                    const fullYear = year < 100 ? 2000 + year : year; // Maneja años de 2 dígitos
                    const date = new Date(fullYear, month - 1, day); 
                
                    return date.toISOString().slice(0, 19).replace('T', ' '); // Formato `YYYY-MM-DD HH:MM:SS`
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
                        
                        console.log(whereConditions.length);
                        if (whereConditions.length === 0) {
                            throw new Error('Identificación o correo no proporcionados');
                        }
                        
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
                            if (!isApproved) {
                                this.logger.log(`Saltando curso ${courseColumn.name} porque no está aprobado. Aprobado: ${isApproved}`);
                                continue;
                            }


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
                            let notaCalificacion = 100; // Valor por defecto
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

                                this.logger.log(`Encuestas: ${JSON.stringify(pollsDetails)}`);


                                for (const poll of pollsDetails) {

                                    const nota = notaCalificacion;
                                
                                    await manager.query(`
                                        INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen, created_at, updated_at)
                                        VALUES (?, ?, ?, ?, NOW(), NOW())
                                        ON DUPLICATE KEY UPDATE porcen = ?
                                    `, [user.id, videoRoom.id, poll.id_polls, nota, nota]);
                                
                                    const [evaluation] = await manager.query(`
                                        SELECT * FROM evaluations WHERE id = ?
                                    `, [poll.id_polls]);
                                
                                    if (evaluation) {
                                        const maxAttempts = evaluation.attempts || Number.MAX_SAFE_INTEGER;
                                
                                        const [existingAttempts] = await manager.query(`
                                            SELECT COUNT(*) as count FROM evaluation_users 
                                            WHERE user_id = ? AND evaluation_id = ?
                                        `, [user.id, poll.id_polls]);
                                
                                        if (existingAttempts.count < maxAttempts) {
                                            await manager.query(`
                                                INSERT INTO evaluation_users (user_id, evaluation_id, created_at, updated_at, nota, approved, intentos)
                                                VALUES (?, ?, NOW(), NOW(), ?, 1, 1)
                                                ON DUPLICATE KEY UPDATE nota = ?, approved = 1, intentos = intentos + 1
                                            `, [user.id, poll.id_polls, nota, nota]);
                                
                                            await manager.query(`
                                                INSERT INTO evaluation_history (evaluation_id, user_id, nota, created_at, updated_at, approved)
                                                VALUES (?, ?, ?, NOW(), NOW(), 1)
                                            `, [poll.id_polls, user.id, nota]);
                                
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                            `, [poll.id_polls]);
                                
                                            for (const question of questions) {
                                                if (question.type === 'open_answer') {
                                                    await manager.query(`
                                                        INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content)
                                                        VALUES (?, ?, NULL, ?, 'Homologacion')
                                                    `, [poll.id_polls, question.id, user.id]);
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
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content)
                                                            VALUES (?, ?, ?, ?, NULL)
                                                        `, [poll.id_polls, question.id, option.id, user.id]);
                                                    }
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
                                    const nota = notaCalificacion; // Usamos la calificación obtenida de la columna del Excel
        
                                    // Actualizar progreso de evaluación
                                    await manager.query(`
                                        INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen, created_at, updated_at)
                                        VALUES (?, ?, ?, ?, ?, ?)
                                        ON DUPLICATE KEY UPDATE porcen = ?
                                        `, [user.id, videoRoom.id, evalDetail.id_evaluation, nota, firstProgressDate, lastProgressDate, nota]);
        
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
                                            
                                            // Registrar en evaluation_user
                                            await manager.query(`
                                                INSERT INTO evaluation_users (user_id, evaluation_id, created_at, updated_at, nota, approved, intentos)
                                                VALUES (?, ?, ?, ?, ?, 1, 1)
                                                ON DUPLICATE KEY UPDATE nota = ?, approved = 1, intentos = intentos + 1
                                                `, [user.id, evalDetail.id_evaluation, firstProgressDate, lastProgressDate, nota, nota]);
        
                                            // Registrar en evaluation_history
                                            await manager.query(`
                                                INSERT INTO evaluation_history (evaluation_id, user_id, nota, created_at, updated_at, approved)
                                                VALUES (?, ?, ?, ?, ?, 1)
                                                `, [evalDetail.id_evaluation, user.id, nota, firstProgressDate, lastProgressDate]);
        
                                            // Obtener preguntas de la evaluación
                                            const questions = await manager.query(`
                                                SELECT * FROM questions WHERE evaluation_id = ?
                                                `, [evalDetail.id_evaluation]);
        
                                            // Crear respuestas para cada pregunta
                                            for (const question of questions) {
                                                if (question.type === 'open_answer') {
                                                    await manager.query(`
                                                        INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content)
                                                        VALUES (?, ?, NULL, ?, 'Homologacion')
                                                        `, [evalDetail.id_evaluation, question.id, user.id]);
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
                                                            INSERT INTO answers (evaluation_id, question_id, option_id, user_id, content)
                                                            VALUES (?, ?, ?, ?, NULL)
                                                        `, [evalDetail.id_evaluation, question.id, optionId, user.id]);
                                                    }
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
                            return; // Usar return en lugar de continue para salir de la transacción actual
                        }else{
                            this.logger.warn(`--------------------------------------------------------------`);
                            this.logger.warn(`Usuario encontrado: ${identification || ''} / ${email || ''}`);
                            this.logger.warn(`--------------------------------------------------------------`);
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
                                continue; // Saltar al siguiente curso
                            }

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
                                    this.logger.log(`Agregando usuario ID ${user.id}, identificacion ${user.identification}  al club ID ${currentClubId}`);
                                    
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
                    this.logger.error(`Error procesando fila: ${error.message}`);
                }
            }
    
            // Eliminar archivo después de procesar
            await unlink(filePath);
    
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
}