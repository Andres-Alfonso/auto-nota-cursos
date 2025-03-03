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
        @InjectRepository(Club)
        private clubRepository: Repository<Club>,
        private dataSource: DataSource,
    ) { }

    async processExcelFile(filePath: string, clubId: number): Promise<any> {
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

            console.log(rows);

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
                const clientId = parseInt(row[indexMap['Client']], 10);
                const firstProgressDate = row['FECHA DE PRIMER AVANCE'];
                const lastProgressDate = row['FECHA ULTIMO AVANCE'];
                try {
                    console.log(identification, email);

                    await this.dataSource.transaction(async (manager) => { // Uso de dataSource en lugar de entityManager
                        // Buscar usuario por identificación o correo
                        const user = await manager.getRepository(User).findOne({
                            where: [
                                { identification: identification, client_id: clientId },
                                { email: email, client_id: clientId }
                            ]
                        });

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
                            for (const content of videoRoomContents) {
                                await manager.query(`
                                INSERT INTO user_pogress_video_rooms (id_user, id_videoroom, id_content, porcen)
                                VALUES (?, ?, ?, 100)
                                ON DUPLICATE KEY UPDATE porcen = 100
                                `, [user.id, videoRoom.id, content.content_id]);
                            }

                            // Obtener detalles de las tareas asociadas al videoroom
                            const taskDetails = await manager.query(`
                                    SELECT tasks_id FROM detail_tasks_videorooms WHERE videorooms_id = ?
                                `, [videoRoom.id]);

                            // Actualizar progreso para cada tarea
                            for (const task of taskDetails) {
                                await manager.query(`
                                    INSERT INTO user_pogress_task_videorooms (id_user, id_videoroom, id_task, porcen)
                                    VALUES (?, ?, ?, 100)
                                    ON DUPLICATE KEY UPDATE porcen = 100
                                    `, [user.id, videoRoom.id, task.tasks_id]);
                            }

                            // Obtener detalles de evaluación
                            const evaluationDetails = await manager.query(`
                                    SELECT id_evaluation FROM detail_evaluation_video_rooms WHERE id_videoroom = ?
                                `, [videoRoom.id]);


                            // Procesar cada evaluación
                            for (const evalDetail of evaluationDetails) {
                                // Actualizar progreso de evaluación
                                await manager.query(`
                                    INSERT INTO user_pogress_evaluation_video_rooms (id_user, id_videoroom, id_evaluation, porcen)
                                    VALUES (?, ?, ?, 100)
                                    ON DUPLICATE KEY UPDATE porcen = 100
                                    `, [user.id, videoRoom.id, evalDetail.id_evaluation]);

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
                                        // Determinar la nota (100 por defecto o la proporcionada en el Excel)
                                        const nota = row['NOTA'] || 100;

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
                        user: `${row['NUMERO DE IDENTIFICACION']} - ${row['CORREO']}`,
                        course: row['NOMBRE DEL CURSO'],
                        error: error.message
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