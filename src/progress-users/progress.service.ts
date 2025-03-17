import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { read, utils } from 'xlsx';
import * as XLSX from 'xlsx';
import { User } from './entities/user.entity';
import { VideoRoom } from './entities/videoroom.entity';
import { Club } from './entities/club.entity';
import { ExcelRowDto } from './dto/excel-row.dto';
import { unlink } from 'fs/promises';
import { GeneralProgressVideoRoom } from './entities/general-progress-videoroom.entity';
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
        @InjectRepository(Club)
        private clubRepository: Repository<Club>,
        private dataSource: DataSource,
    ) { }

    async processExcelFile(filePath: string, clubId: number, clientId?: number): Promise<any> {
        try {
            // Verificar que el club existe
            const club = await this.clubRepository.findOneBy({ id: clubId });
            if (!club) {
                throw new HttpException('Club no encontrado', HttpStatus.NOT_FOUND);
            }

            // Leer el archivo Excel
            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

            let successCount = 0;
            let errorCount = 0;
            let errors: { user: string; course: string; error: string }[] = [];


            const headers = rows.shift(); // Remueve la primera fila y la usa como encabezados
            const indexMap = headers.reduce((acc, header, index) => {
                acc[header.trim()] = index;
                return acc;
            }, {});

            // Procesar cada fila en una transacción
            for (const row of rows) {

                const identification = row[indexMap['NUMERO DE IDENTIFICACION']]?.toString().trim();
                const email = row[indexMap['CORREO']]?.toLowerCase().trim();
                const userClientId = clientId || parseInt(row[indexMap['Client']], 10);
                const firstProgressDate = row['FECHA DE PRIMER AVANCE'];
                const lastProgressDate = row['FECHA ULTIMO AVANCE'];
                try {
                    await this.dataSource.transaction(async (manager) => { // Uso de dataSource en lugar de entityManager
                        // Buscar usuario por identificación o correo
                        const whereConditions: any[] = [];
                        
                        if (identification) {
                            whereConditions.push({ identification: identification, client_id: userClientId });
                        }
                        
                        if (email) {
                            whereConditions.push({ email: email, client_id: userClientId });
                        }
                        
                        if (whereConditions.length === 0) {
                            throw new Error('Identificación o correo no proporcionados');
                        }
                        
                        const user = await manager.getRepository(User).findOne({where: whereConditions});

                        console.log(user);


                        if (!user) {
                            throw new Error(`Usuario no encontrado: ${row['NUMERO DE IDENTIFICACION']} / ${row['CORREO']}`);
                        }

                        // Buscar videoroom por id de modulo del curso
                        const videoRooms = await manager.getRepository(VideoRoom).find({
                            where: { club_id: clubId }, // Referencia directa a la columna club_id
                            relations: ['club']
                        });

                        if (!videoRooms || videoRooms.length === 0) {
                            throw new Error(`VideoRoom no encontrado para el curso: ${row['NOMBRE DEL CURSO']}`);
                        }

                        for (const videoRoom of videoRooms) {
                            // Actualizar progreso general del videoroom
                            // const progressRepository = manager.getRepository(GeneralProgressVideoRoom);

                            const existingProgress = await this.generalProgressVideoroomsRepository.findOne({
                                where: { id_user: user.id, id_videoroom: videoRoom.id },
                              });
                              
                            if (existingProgress) {
                                // Actualizar el registro existente
                                existingProgress.porcen = 100;
                                existingProgress.updated_at = lastProgressDate;
                                await this.generalProgressVideoroomsRepository.save(existingProgress);
                            } else {
                                // Crear un nuevo registro
                                await this.generalProgressVideoroomsRepository.save({
                                    id_user: user.id,
                                    id_videoroom: videoRoom.id,
                                    porcen: 100,
                                    created_at: firstProgressDate,
                                    updated_at: lastProgressDate,
                                });
                            }

                            // await this.generalProgressVideoroomsRepository.save({
                            //     id_user: user.id,
                            //     id_videoroom: videoRoom.id,
                            //     porcen: 100,
                            //     created_at: firstProgressDate,
                            //     updated_at: lastProgressDate
                            //   });

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

                            // Actualizar progreso para cada contenido
                            // for (const content of videoRoomContents) {
                            //     await manager.query(`
                            //     INSERT INTO user_pogress_video_rooms (id_user, id_videoroom, id_content, porcen)
                            //     VALUES (?, ?, ?, 100)
                            //     ON DUPLICATE KEY UPDATE porcen = 100
                            //     `, [user.id, videoRoom.id, content.content_id]);
                            // }

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

                            // Actualziar o crear progreso para cada actividad
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

                            // Actualziar o crear progreso para cada autoevaluacion
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

                            // Actualizar progreso para cada tarea
                            // for (const task of taskDetails) {
                            //     await manager.query(`
                            //         INSERT INTO user_pogress_task_videorooms (id_user, id_videoroom, id_task, porcen)
                            //         VALUES (?, ?, ?, 100)
                            //         ON DUPLICATE KEY UPDATE porcen = 100
                            //         `, [user.id, videoRoom.id, task.tasks_id]);
                            // }

                            // // Procesar cada evaluacion
                            // for (const evalDetail of evaluationDetails){
                            //     const existingProgressEvaluationVideoroom = await this.userProgressEvaluationVideoRoomRepository.findOne({
                            //         where: { id_evaluation: evalDetail.id, id_user: user.id, id_videoroom: videoRoom.id},
                            //     });

                            //     if (existingProgressEvaluationVideoroom) {
                            //         // Actualizar el registro existente
                            //         existingProgressEvaluationVideoroom.porcen = 100;
                            //         existingProgressEvaluationVideoroom.updated_at = lastProgressDate;
                            //         await this.userProgressEvaluationVideoRoomRepository.save(existingProgressEvaluationVideoroom);
                            //     } else {
                            //         // Crear un nuevo registro
                            //         await this.userProgressEvaluationVideoRoomRepository.save({
                            //             porcen: 100,
                            //             id_user: user.id,
                            //             id_videoroom: videoRoom.id,
                            //             id_evaluation: evalDetail.id,
                            //             created_at: firstProgressDate,
                            //             updated_at: lastProgressDate,
                            //         });
                            //     }
                            // }

                            // Obtener detalles de evaluación
                            const evaluationDetails = await manager.query(`
                                SELECT id_evaluation FROM detail_evaluation_video_rooms WHERE id_videoroom = ?
                            `, [videoRoom.id]);

                            // Procesar cada evaluación
                            for (const evalDetail of evaluationDetails) {

                                // Determinar la nota (100 por defecto o la proporcionada en el Excel)
                                const nota = parseInt(row[indexMap['NOTA']], 10) || 100; // Default to 100 if parsing fails

                                // Actualizar progreso de evaluación
                                await manager.query(`
                                    INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen)
                                    VALUES (?, ?, ?, ?)
                                    ON DUPLICATE KEY UPDATE porcen = ?
                                    `, [user.id, videoRoom.id, evalDetail.id_evaluation, nota, nota]);

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
                                            INSERT INTO evaluation_users (user_id, evaluation_id, nota, approved, intentos)
                                            VALUES (?, ?, ?, 1, 1)
                                            ON DUPLICATE KEY UPDATE nota = ?, approved = 1, intentos = intentos + 1
                                            `, [user.id, evalDetail.id_evaluation, nota, nota]);

                                        // Registrar en evaluation_history
                                        await manager.query(`
                                            INSERT INTO evaluation_history (evaluation_id, user_id, nota, approved)
                                            VALUES (?, ?, ?, 1)
                                            `, [evalDetail.id_evaluation, user.id, nota]);

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
                    });

                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push({
                        user: `Columna NUMERO DE IDENTIFICACION: ${row['NUMERO DE IDENTIFICACION']} - Columna CORREO: ${row['CORREO']}`,
                        course: row['NOMBRE DEL CURSO'],
                        error: `Error ` + error.message
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
                errorDetails: errors
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