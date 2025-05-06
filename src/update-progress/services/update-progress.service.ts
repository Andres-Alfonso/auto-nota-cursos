import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Not, IsNull, EntityManager } from 'typeorm';
import { read, utils } from 'xlsx';
import * as XLSX from 'xlsx';
import { User } from '../../progress-users/entities/user.entity';
import { GeneralProgressVideoRoom } from '../../progress-users/entities/general-progress-videoroom.entity';
import { VideoRoom } from '../../progress-users/entities/videoroom.entity';
import { Club } from '../../progress-users/entities/club.entity';
import { ExcelRowDto } from '../../progress-users/dto/excel-row.dto';
import { unlink } from 'fs/promises';

import { ClubTranslation } from '../../progress-users/entities/club_translations.entity';
import { ClubUser } from '../../progress-users/entities/club-user.entity';

import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { EvaluationClub } from 'src/progress-users/entities/evaluation-club.entity';
import { Evaluation } from 'src/progress-users/entities/evaluation.entity';
import { UserProgressEvaluationVideoRoom } from 'src/progress-users/entities/user-progress-evaluation-videoroom.entity';
import { EvaluationUser } from 'src/progress-users/entities/evaluation-user.entity';
import { Answer } from 'src/progress-users/entities/answer.entity';
import { DetailEvaluationVideoRoom } from 'src/progress-users/entities/detail-evaluation-videoroom.entity';
import { EvaluationHistory } from 'src/progress-users/entities/evaluation-history.entity';

@Injectable()
export class UpdateProgressService {
    private readonly logger = new Logger(UpdateProgressService.name);

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(VideoRoom)
        private videoRoomRepository: Repository<VideoRoom>,
        @InjectRepository(Club)
        private clubRepository: Repository<Club>,
        @InjectRepository(ClubUser)
        private clubUserRepository: Repository<ClubUser>,
        @InjectRepository(GeneralProgressVideoRoom)
        private generalProgressVideoroomsRepository: Repository<GeneralProgressVideoRoom>,
        @InjectRepository(EvaluationClub)
        private evaluationClubRepository: Repository<EvaluationClub>,
        @InjectRepository(Evaluation)
        private evaluationRepository: Repository<Evaluation>,
        @InjectRepository(UserProgressEvaluationVideoRoom)
        private userProgressEvaluationVideoroomRepository: Repository<UserProgressEvaluationVideoRoom>,
        @InjectRepository(EvaluationUser)
        private evaluationUserRepository: Repository<EvaluationUser>,
        @InjectRepository(Answer)
        private answerRepository: Repository<Answer>,
        @InjectRepository(DetailEvaluationVideoRoom)
        private detailEvaluationVideoRoomRepository: Repository<DetailEvaluationVideoRoom>,
        @InjectRepository(EvaluationHistory)
        private evaluationHistoryRepository: Repository<EvaluationHistory>,

        private dataSource: DataSource,
    ) { }

    
    async processExcelFile(filePath: string, clubId?: number, clientId?: number): Promise<any> {
        try {
            // Read the Excel file
            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    
            // Set up result tracking
            const processingStats = {
                successCount: 0,
                errorCount: 0,
                usersNotFoundCount: 0,
                countCoursesNotFound: 0,
                errors: [] as { user: string; course: string; error: string }[],
                coursesNotFound: [] as string[],
                usersNotFound: [] as string[],
                usersAddedToClub: 0,
                usersAlreadyInClub: 0,
                progressCreated: 0,
                progressUpdated: 0
            };
    
            // Arrays for detailed reporting
            const detailedResults: {
                identification: string;
                email: string;
                courseName: string;
                action: string;  // "added", "removed", "already_registered", "not_found", "course_not_found"
                status: string;  // "success", "error"
                message: string;
            }[] = [];
    
            const headers = rows.shift(); // Remove the first row and use it as headers
            const indexMap = this.createIndexMap(headers);
    
            // Identify course columns - those with "calificacion" in the next column
            const courseColumns = this.identifyCourseColumns(headers);
            
            if (courseColumns.length === 0) {
                this.logger.error('No course columns found in the Excel file');
                throw new HttpException('No course columns identified in the Excel file', HttpStatus.BAD_REQUEST);
            }
            
            this.logger.log(`Total course columns detected: ${courseColumns.length}`);
            for (const col of courseColumns) {
                this.logger.log(`Course: ${col.name}, indices: ${JSON.stringify(col)}`);
            }
    
            // Process each row in a transaction
            let rowIndex = 1;
            for (const row of rows) {
                this.logger.warn(`Processing row ${rowIndex}...`);
                const identification = this.getIdentification(row, indexMap);
                const email = row[indexMap['CORREO']]?.toString().toLowerCase().trim();
                const userClientId = clientId || parseInt(row[indexMap['Client']], 10);
                
                try {
                    await this.processUserRow(
                        row, 
                        identification, 
                        email, 
                        userClientId, 
                        courseColumns, 
                        clubId, 
                        processingStats,
                        rowIndex
                    );
                } catch (error) {
                    processingStats.errorCount++;
                    processingStats.errors.push({
                        user: `Identification: ${identification || 'Not provided'} - Email: ${email || 'Not provided'}`,
                        course: 'Multiple courses',
                        error: `Error: ${error.message}`
                    });
                    this.logger.error(`Error in row ${rowIndex}: ${error.message}`);
                }
                rowIndex++;
            }
    
            // Delete file after processing
            await unlink(filePath);
    
            // Generate report for courses not found
            await this.generateReportFile(processingStats);
    
            this.logger.warn({
                message: 'Process completed',
                total: rows.length,
                success: processingStats.successCount,
                errors: processingStats.errorCount,
                errorDetails: processingStats.errors,
                countCoursesNotFound: processingStats.countCoursesNotFound,
                coursesNotFound: processingStats.coursesNotFound,
                usersNotFoundCount: processingStats.usersNotFoundCount,
                usersNotFound: processingStats.usersNotFound
            });
    
            return {
                message: 'Process completed',
                total: rows.length,
                success: processingStats.successCount,
                errors: processingStats.errorCount,
                errorDetails: processingStats.errors,
                countCoursesNotFound: processingStats.countCoursesNotFound,
                coursesNotFound: processingStats.coursesNotFound,
                usersNotFoundCount: processingStats.usersNotFoundCount,
                usersNotFound: processingStats.usersNotFound,
            };
        } catch (error) {
            this.logger.error(`Error processing file: ${error.message}`);
            throw new HttpException(
                `Error processing file: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
    
    // Helper method to create index map from headers
    private createIndexMap(headers: any[]): Record<string, number> {
        return headers.reduce((acc, header, index) => {
            acc[header.trim()] = index;
            return acc;
        }, {});
    }
    
    // Helper method to identify course columns
    private identifyCourseColumns(headers: any[]): any[] {
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
                
                this.logger.log(`Course column detected: ${headers[i].trim()} at index: ${i}`);
            }
        }
        
        return courseColumns;
    }
    
    // Helper method to get identification from row
    private getIdentification(row: any[], indexMap: Record<string, number>): string {
        return row[indexMap['CEDULA']?.toString().trim() || indexMap['NUMERO DE IDENTIFICACION']]?.toString().trim();
    }
    
    // Helper method to parse and format dates
    private parseDate(dateStr: string): string {
        if (!dateStr || dateStr.trim() === '') {
            return this.formatDateForMySQL(new Date());
        }
        
        // Handle special cases like '01/00/1900'
        if (dateStr.includes('00/') || dateStr.includes('/00')) {
            this.logger.log(`Invalid date detected: ${dateStr}, using current date`);
            return this.formatDateForMySQL(new Date());
        }
        
        try {
            let date: Date;
            
            // Check if format is DD/MM/YYYY
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/').map(p => parseInt(p.trim(), 10));
                
                // If any part is not a number, use current date
                if (parts.some(isNaN)) {
                    this.logger.log(`Invalid date format: ${dateStr}, using current date`);
                    return this.formatDateForMySQL(new Date());
                }
                
                const [month, day, year] = parts;
                
                // Always assume format DD/MM/YYYY
                date = new Date(year, month - 1, day);
                
                // Handle 2-digit years
                if (year < 100) {
                    date.setFullYear(2000 + year);
                }
            } else if (dateStr.includes('-')) {
                // For hyphen format, split and order as DD/MM/YYYY
                const parts = dateStr.split('-').map(p => parseInt(p.trim(), 10));
                
                if (parts.length === 3) {
                    // Assume format DD-MM-YYYY
                    const [day, month, year] = parts;
                    date = new Date(year, month - 1, day);
                    
                    // Handle 2-digit years
                    if (year < 100) {
                        date.setFullYear(2000 + year);
                    }
                } else {
                    // If not 3 parts, try to parse directly
                    date = new Date(dateStr);
                }
            } else {
                // Try to parse directly
                date = new Date(dateStr);
            }
            
            // Check if resulting date is valid
            if (isNaN(date.getTime()) || date.getFullYear() < 1970) {
                this.logger.log(`Invalid date after parsing: ${dateStr}, using current date`);
                return this.formatDateForMySQL(new Date());
            }
            
            return this.formatDateForMySQL(date);
        } catch (error) {
            this.logger.error(`Error parsing date ${dateStr}: ${error.message}`);
            return this.formatDateForMySQL(new Date());
        }
    }
    
    // Helper method to format dates for MySQL
    private formatDateForMySQL(date: Date): string {
        // Check if date is valid
        if (isNaN(date.getTime())) {
            // If date is invalid, return current date
            return new Date().toISOString().slice(0, 19).replace("T", " ");
        }
        
        // Check if date is before a reasonable limit (e.g., 1970)
        if (date.getFullYear() < 1970) {
            // If date is too old, use current date
            return new Date().toISOString().slice(0, 19).replace("T", " ");
        }
        
        return date.toISOString().slice(0, 19).replace("T", " "); // Format: 'YYYY-MM-DD HH:MM:SS'
    }
    
    // Process a single user row
    private async processUserRow(
        row: any[],
        identification: string,
        email: string,
        userClientId: number,
        courseColumns: any[],
        clubId: number | undefined,
        processingStats: any,
        rowIndex: number
    ): Promise<void> {
        // Set default dates
        const firstProgressDate = this.formatDateForMySQL(new Date());
        const lastProgressDate = this.formatDateForMySQL(new Date());
    
        // Find user by identification or email
        const whereConditions: any[] = [];
        
        if (identification) {
            whereConditions.push({ identification: identification, client_id: userClientId });
        }
        
        if (whereConditions.length === 0) {
            throw new Error('Identification or email not provided');
        }
    
        await this.dataSource.transaction(async (manager) => {
            this.logger.warn(identification, userClientId);
            
            const user = await manager.getRepository(User).findOne({where: whereConditions});
            
            this.logger.warn(`--------------------------------------------------------------`);
            this.logger.warn(user);
            this.logger.warn(`--------------------------------------------------------------`);
    
            if (!user) {
                processingStats.usersNotFoundCount++;
                processingStats.usersNotFound.push(`Identification: ${identification || 'Not provided'}`);
                this.logger.warn(`User not found: ${identification || ''} / ${email || ''}`);
                return; // Use return instead of continue to exit current transaction
            }
    
            for (const courseColumn of courseColumns) {
                await this.processCoursesForUser(
                    manager,
                    user,
                    row,
                    courseColumn,
                    clubId,
                    processingStats
                );
            }
        });
    }
    
    // Process courses for a user
    private async processCoursesForUser(
        manager: EntityManager,
        user: User,
        row: any[],
        courseColumn: any,
        clubId: number | undefined,
        processingStats: any
    ): Promise<void> {
        // Reset all variables at the beginning of each course processing
        // to avoid using values from previous iterations
        let currentClubId: number | null = null;
        let statusPending = false;
        let videoRooms: VideoRoom[] = [];
        
        // Show debugging information
        this.logger.log(`Procesando curso: ${courseColumn.name}`);
    
        const courseName = courseColumn.name;
        const courseCalification = courseColumn.calificacionIndex;
        
        // Get the course value (APPROVED/PENDING/NOT APPLICABLE)
        const courseValue = row[courseColumn.index]?.toString().trim() || '';
        const courseCalificationValue = row[courseCalification]?.toString().trim() || '';
        
        this.logger.log(`Valor de curso: ${courseValue}`);
        this.logger.log(`Calificación de curso: ${courseCalificationValue}`);
        
        // Convert to uppercase for consistent comparison
        const valueUpperCase = courseValue.toUpperCase();
        
        // Define the status based on the course value
        const shouldBeInCourse = valueUpperCase === 'APROBADO' || 
                            valueUpperCase.includes('APROB');
        
        // Check if the course is PENDING or NOT APPLICABLE
        const isPendingOrNotApplicable = valueUpperCase === 'NO APLICA' || 
                                   valueUpperCase.includes('NO APL') || 
                                   valueUpperCase === 'PENDIENTE' || 
                                   valueUpperCase.includes('PEND');
        
        // Handle the NOT APPLICABLE/PENDING case to clean user data
        if (!shouldBeInCourse && isPendingOrNotApplicable) {
            
            // Si tiene calificación, NO debe eliminar los datos
            if (courseCalificationValue !== '' && courseCalificationValue !== null) {
                this.logger.log(`El curso ${courseName} tiene calificación: ${courseCalificationValue}, no se eliminará`);
                return;
            }
    
            this.logger.log(`User ID ${user.id} is not applicable to club ${courseName} and no tiene calificación`);
    
            // Find video rooms based on club or course name
            videoRooms = await this.findVideoRooms(manager, clubId, courseName);
            
            if (!videoRooms || videoRooms.length === 0) {
                this.logger.warn(`No VideoRooms found for course: ${courseName}`);
                if (!processingStats.coursesNotFound.includes(courseName)) {
                    processingStats.coursesNotFound.push(courseName);
                    processingStats.countCoursesNotFound++;
                }
                return;
            }
            
            // Obtener el club_id si no fue proporcionado
            if (!clubId && videoRooms.length > 0 && videoRooms[0].club_id) {
                currentClubId = videoRooms[0].club_id;
            } else {
                currentClubId = clubId || null;
            }
            
            // NUEVA VALIDACIÓN: Verificar la fecha de registro del usuario en el club
            if (currentClubId) {
                const existingClubUser = await manager.getRepository(ClubUser).findOne({
                    where: { club_id: currentClubId, user_id: user.id }
                });
                
                // Si el usuario está registrado, verificar la fecha de registro
                if (existingClubUser) {
                    // Fecha límite: 25 de marzo de 2025
                    const cutoffDate = new Date('2025-03-25');
                    const registrationDate = new Date(existingClubUser.created_at);
                    
                    // Si el usuario fue registrado después de la fecha límite, no hacer nada
                    if (registrationDate >= cutoffDate) {
                        this.logger.log(`Usuario ID ${user.id} fue registrado en el club ID ${currentClubId} después del 25 de marzo de 2025. No se eliminarán datos.`);
                        
                        // Aquí puedes agregar cualquier otra lógica necesaria para usuarios nuevos
                        if (processingStats.usersAlreadyInClub !== undefined) {
                            processingStats.usersAlreadyInClub++;
                        }
                        
                        return; // Salir sin procesar más
                    }
                    
                    this.logger.log(`Usuario ID ${user.id} fue registrado antes del 25 de marzo de 2025 en el club ID ${currentClubId}. Continuando con la limpieza de datos.`);
                }
            }
    
            // Process each video room found - using a loop to maintain separate context for each
            for (const videoRoom of videoRooms) {
                // Important: Create a new isolated context for each video room
                const currentVideoRoomId = videoRoom.id;
                
                this.logger.log(`Processing video room ${currentVideoRoomId} for course ${courseName}`);
                await this.cleanProgressUserData(user.id, currentVideoRoomId);
                await this.cleanUserEvaluationData(user.id, currentVideoRoomId);
            }
        } else if (shouldBeInCourse) {
            // Implement handling for users who should be in course
            // This can be expanded as needed
            this.logger.log(`User ID ${user.id} should be in course ${courseName} with status: ${courseValue}`);
            
            // You could add course assignment/configuration logic here
        } else {
            // Handle any other status that might be in the Excel
            this.logger.log(`User ID ${user.id} has unrecognized status "${courseValue}" for course ${courseName}`);
        }
    }
    
    // Helper method to find video rooms
    private async findVideoRooms(
        manager: EntityManager,
        clubId: number | undefined,
        courseName: string
    ): Promise<VideoRoom[]> {
        let videoRooms: VideoRoom[] = [];
        
        if (clubId) {
            // If clubId is provided, find all video rooms of that club
            videoRooms = await manager.getRepository(VideoRoom).find({
                where: { club_id: clubId },
                relations: ['club']
            });
        } else {
            // First try to find exact match of course title
            const clubTranslation = await manager.getRepository(ClubTranslation).findOne({
                where: { title: courseName }
            });
    
            this.logger.log(`Course ID search: ${clubTranslation?.club_id}`);
            
            // If there's an exact match
            if (clubTranslation) {
                videoRooms = await manager.getRepository(VideoRoom).find({
                    where: { club_id: clubTranslation.club_id },
                    relations: ['club']
                });
            } else {
                // Use LIKE to find partial matches
                const partialMatches = await manager.query(`
                    SELECT * FROM club_translations 
                    WHERE title LIKE ? 
                    LIMIT 1
                `, [`%${courseName}%`]);
                
                if (partialMatches && partialMatches.length > 0) {
                    videoRooms = await manager.getRepository(VideoRoom).find({
                        where: { club_id: partialMatches[0].club_id },
                        relations: ['club']
                    });
                }
            }
        }
        
        return videoRooms;
    }

    private async cleanProgressUserData(userId: number, videoRoomId: number): Promise<void> {
        // Reset any variables needed for this method
        this.logger.log(`Starting cleaning progress data for user ${userId} and video room ${videoRoomId}`);
        
        // Process progress records with isolated context
        const existingProgress = await this.generalProgressVideoroomsRepository.findOne({
            where: { id_videoroom: videoRoomId, id_user: userId }
        });
        
        if (existingProgress) {
            this.logger.log(`Removing progress record for user ${userId} in video room ${videoRoomId}`);
            try {
                await this.generalProgressVideoroomsRepository.remove(existingProgress);
                this.logger.log(`Progress record successfully removed`);
            } catch (error) {
                // Si falla la eliminación, intentar un enfoque alternativo con delete
                this.logger.error(`Error removing progress: ${error.message}, trying with delete`);
                await this.generalProgressVideoroomsRepository.delete({
                    id: existingProgress.id
                });
                this.logger.log(`Progress record successfully removed with delete`);
            }
        } else {
            this.logger.log(`No progress record found for user ${userId} in video room ${videoRoomId}`);
        }
    }
    
    // Clean user evaluation data
    private async cleanUserEvaluationData(userId: number, videoRoomId: number): Promise<void> {
        // Reset any variables needed for this method
        this.logger.log(`Starting cleaning data for user ${userId} and video room ${videoRoomId}`);
        
        // Process polls with isolated context
        await this.cleanPollData(userId, videoRoomId);
        
        // Process evaluations with isolated context
        await this.cleanEvaluationData(userId, videoRoomId);
        
        this.logger.log(`Finished cleaning data for user ${userId} and video room ${videoRoomId}`);
    }
    
    // Clean poll data
    private async cleanPollData(userId: number, videoRoomId: number): Promise<void> {
        // Reset variables to avoid contaminación de iteraciones previas
        this.logger.log(`Looking for polls for video room ${videoRoomId}`);
        
        // Find polls for this specific video room
        const pollsDetails = await this.videoRoomRepository.find({
            where: { id: videoRoomId, id_polls: Not(IsNull()) }
        });

        this.logger.log(`Polls encontrados para video room ${videoRoomId}: ${pollsDetails.length}`);

        // Process each poll independently
        for (const poll of pollsDetails) {
            // Create isolated context for each poll
            const currentPollId = poll.id_polls;
            
            if (!currentPollId) {
                this.logger.log(`Poll ID is null for video room ${videoRoomId}, skipping`);
                continue;
            }
            
            // Fetch evaluation with a fresh query
            const existingEvaluation = await this.evaluationRepository.findOne({
                where: { id: currentPollId }
            });

            if (existingEvaluation && existingEvaluation.enable_certificate === 1) {
                // Process answers within isolated context - CRITICAL FIX HERE
                this.logger.log(`Looking for poll answers ${currentPollId} from user ${userId}`);
                
                // Buscar TODAS las respuestas del usuario para esta encuesta (puede haber múltiples registros)
                const existingAnswers = await this.answerRepository.find({
                    where: { user_id: userId, evaluation_id: currentPollId }
                });

                if (existingAnswers && existingAnswers.length > 0) {
                    this.logger.log(`Found ${existingAnswers.length} poll answers for poll ${currentPollId} from user ${userId}`);
                    
                    // Eliminar cada respuesta individualmente para asegurar que todas sean procesadas
                    for (const answer of existingAnswers) {
                        try {
                            this.logger.log(`Removing answer ID ${answer.id} for poll ${currentPollId}`);
                            await this.answerRepository.remove(answer);
                        } catch (error) {
                            // Si falla la eliminación, intentar un enfoque alternativo con delete
                            this.logger.error(`Error removing answer: ${error.message}, trying with deleteOne`);
                            await this.answerRepository.delete({
                                id: answer.id,
                                user_id: userId,
                                evaluation_id: currentPollId
                            });
                        }
                    }
                    
                    this.logger.log(`All ${existingAnswers.length} poll answers successfully removed`);
                } else {
                    this.logger.log(`No poll answers found for poll ${currentPollId} from user ${userId}`);
                }
                
                // Process progress records within isolated context
                this.logger.log(`Looking for progress record for poll ${currentPollId} from user ${userId}`);
                
                const existingProgressEvaluation = await this.userProgressEvaluationVideoroomRepository.findOne({
                    where: { id_evaluation: currentPollId, id_user: userId }
                });

                if (existingProgressEvaluation) {
                    this.logger.log(`Removing progress record for poll ${currentPollId} from user ${userId}`);
                    try {
                        await this.userProgressEvaluationVideoroomRepository.remove(existingProgressEvaluation);
                        this.logger.log(`Progress record successfully removed`);
                    } catch (error) {
                        // Si falla la eliminación, intentar un enfoque alternativo con delete
                        this.logger.error(`Error removing progress: ${error.message}, trying with delete`);
                        await this.userProgressEvaluationVideoroomRepository.delete({
                            id: existingProgressEvaluation.id
                        });
                        this.logger.log(`Progress record successfully removed with delete`);
                    }
                } else {
                    this.logger.log(`No progress record found for poll ${currentPollId} from user ${userId}`);
                }
            } else {
                this.logger.log(`Poll ${currentPollId} doesn't have certificates enabled or doesn't exist`);
            }
        }
    }
    
    // Clean evaluation data
    private async cleanEvaluationData(userId: number, videoRoomId: number): Promise<void> {
        // Reset variables to avoid contaminación de iteraciones previas
        this.logger.log(`Looking for evaluations for video room ${videoRoomId}`);
        
        // Find evaluations for this specific video room
        const evaluationDetails = await this.detailEvaluationVideoRoomRepository.find({
            where: { id_videoroom: videoRoomId, id_evaluation: Not(IsNull()) }
        });
    
        this.logger.log(`Evaluations encontradas para video room ${videoRoomId}: ${evaluationDetails.length}`);
    
        // Process each evaluation independently
        for (const evaluation of evaluationDetails) {
            // Create isolated context for each evaluation
            const currentEvaluationId = evaluation.id_evaluation;
            
            if (!currentEvaluationId) {
                this.logger.log(`Evaluation ID is null for video room ${videoRoomId}, skipping`);
                continue;
            }
            
            // Fetch evaluation with a fresh query
            const existingEvaluation = await this.evaluationRepository.findOne({
                where: { id: currentEvaluationId }
            });
    
            if (existingEvaluation && existingEvaluation.enable_certificate === 1) {
                // Buscar y eliminar posibles respuestas asociadas con esta evaluación
                // Primero buscar todas las respuestas del usuario para esta evaluación
                const existingAnswers = await this.answerRepository.find({
                    where: { user_id: userId, evaluation_id: currentEvaluationId }
                });
    
                if (existingAnswers && existingAnswers.length > 0) {
                    this.logger.log(`Found ${existingAnswers.length} answers for evaluation ${currentEvaluationId} from user ${userId}`);
                    
                    // Eliminar cada respuesta individualmente
                    for (const answer of existingAnswers) {
                        try {
                            this.logger.log(`Removing answer ID ${answer.id} for evaluation ${currentEvaluationId}`);
                            await this.answerRepository.remove(answer);
                        } catch (error) {
                            // Si falla la eliminación, intentar un enfoque alternativo
                            this.logger.error(`Error removing answer: ${error.message}, trying with deleteOne`);
                            await this.answerRepository.delete({
                                id: answer.id,
                                user_id: userId,
                                evaluation_id: currentEvaluationId
                            });
                        }
                    }
                    
                    this.logger.log(`All ${existingAnswers.length} evaluation answers successfully removed`);
                } else {
                    this.logger.log(`No answers found for evaluation ${currentEvaluationId} from user ${userId}`);
                }
                
                // Process progress records within isolated context
                this.logger.log(`Looking for progress record for evaluation ${currentEvaluationId} from user ${userId}`);
                
                const existingProgressEvaluation = await this.userProgressEvaluationVideoroomRepository.findOne({
                    where: { id_evaluation: currentEvaluationId, id_user: userId }
                });
    
                if (existingProgressEvaluation) {
                    this.logger.log(`Removing progress record for evaluation ${currentEvaluationId} from user ${userId}`);
                    try {
                        await this.userProgressEvaluationVideoroomRepository.remove(existingProgressEvaluation);
                        this.logger.log(`Progress record successfully removed`);
                    } catch (error) {
                        // Si falla la eliminación, intentar un enfoque alternativo
                        this.logger.error(`Error removing progress: ${error.message}, trying with delete`);
                        await this.userProgressEvaluationVideoroomRepository.delete({
                            id: existingProgressEvaluation.id
                        });
                        this.logger.log(`Progress record successfully removed with delete`);
                    }
                } else {
                    this.logger.log(`No progress record found for evaluation ${currentEvaluationId} from user ${userId}`);
                }
    
                // Process evaluation user records within isolated context
                this.logger.log(`Looking for evaluation user record ${currentEvaluationId} from user ${userId}`);
                
                const existingEvaluationUser = await this.evaluationUserRepository.findOne({
                    where: { user_id: userId, evaluation_id: currentEvaluationId }
                });
                
                if (existingEvaluationUser) {
                    this.logger.log(`Removing evaluation user record ${currentEvaluationId} from user ${userId}`);
                    try {
                        await this.evaluationUserRepository.remove(existingEvaluationUser);
                        this.logger.log(`Evaluation user record successfully removed`);
                    } catch (error) {
                        // Si falla la eliminación, intentar un enfoque alternativo
                        this.logger.error(`Error removing evaluation user: ${error.message}, trying with delete`);
                        await this.evaluationUserRepository.delete({
                            id: existingEvaluationUser.id
                        });
                        this.logger.log(`Evaluation user record successfully removed with delete`);
                    }
                } else {
                    this.logger.log(`No evaluation user record found for evaluation ${currentEvaluationId} from user ${userId}`);
                }
    
                // Process evaluation history records within isolated context
                this.logger.log(`Looking for evaluation history records ${currentEvaluationId} from user ${userId}`);
                
                const existingHistoryEvaluation = await this.evaluationHistoryRepository.find({
                    where: { user_id: userId, evaluation_id: currentEvaluationId }
                });
                
                if (existingHistoryEvaluation && existingHistoryEvaluation.length > 0) {
                    this.logger.log(`Removing ${existingHistoryEvaluation.length} evaluation history records ${currentEvaluationId} from user ${userId}`);
                    try {
                        await this.evaluationHistoryRepository.remove(existingHistoryEvaluation);
                        this.logger.log(`Evaluation history records successfully removed`);
                    } catch (error) {
                        // Si falla la eliminación, intentar un enfoque alternativo
                        this.logger.error(`Error removing evaluation history: ${error.message}, trying with delete for each`);
                        for (const history of existingHistoryEvaluation) {
                            await this.evaluationHistoryRepository.delete({
                                id: history.id
                            });
                        }
                        this.logger.log(`Evaluation history records successfully removed with delete`);
                    }
                } else {
                    this.logger.log(`No evaluation history records found for evaluation ${currentEvaluationId} from user ${userId}`);
                }
            } else {
                this.logger.log(`Evaluation ${currentEvaluationId} doesn't have certificates enabled or doesn't exist`);
            }
        }
    }
    
    // Generate report file
    private async generateReportFile(processingStats: any): Promise<void> {
        const folderPath = path.join(__dirname, '..', '..', 'uploads', 'clubs_not_found');
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
    
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Courses Not Found');
    
        worksheet.columns = [
            { header: 'Course Not Found', key: 'name', width: 50 }
        ];
    
        processingStats.coursesNotFound.forEach(course => {
            worksheet.addRow({ name: course });
        });
    
        // Sheet 2: Users not found (if any)
        if (processingStats.usersNotFound && processingStats.usersNotFound.length > 0) {
            const worksheetUsers = workbook.addWorksheet('Users Not Found');
            worksheetUsers.columns = [
                { header: 'Detail', key: 'detail', width: 60 }
            ];
            processingStats.usersNotFound.forEach(detail => {
                worksheetUsers.addRow({ detail });
            });
        }
    
        const filePathExcel = path.join(folderPath, `courses_not_found_${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(filePathExcel);
    
        this.logger.log(`Excel file generated: ${filePathExcel}`);
    }

}