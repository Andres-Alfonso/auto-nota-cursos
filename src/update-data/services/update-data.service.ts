import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Not, IsNull, EntityManager } from 'typeorm';
import { read, utils } from 'xlsx';
import * as XLSX from 'xlsx';
import { User } from '../../progress-users/entities/user.entity';
import { ExcelRowDto } from '../../progress-users/dto/excel-row.dto';
import { unlink } from 'fs/promises';

import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { ProcessReport } from '../interfaces/process-report.interface';
import { Club } from 'src/reports_v2/entities/club.entity';
import { ClubUser } from 'src/reports_v2/entities/club-user.entity';


interface UserRow {
  CEDULA: string;
  NOMBRE: string;
  SERVICIO: string;
  CARGO: string;
  'TIPO DE CARGO': string;
}

@Injectable()
export class UpdateDataService {
    private readonly logger = new Logger(UpdateDataService.name);

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Club)
        private clubRepository: Repository<Club>,
        @InjectRepository(ClubUser)
        private clubUserRepository: Repository<ClubUser>,
        private dataSource: DataSource,
    ) { }

    async processExcelFile(filePath: string, clientId?: number): Promise<any> {
        try {
            // Leer el archivo Excel
            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    
            // Configurar el seguimiento de resultados
            const processingStats = {
                successCount: 0,
                errorCount: 0,
                usersNotFoundCount: 0,
                errors: [] as { identification: string; error: string }[],
                usersNotFound: [] as string[],
            };
    
            const headers = rows.shift(); // Eliminar la primera fila y usarla como encabezados
            const indexMap = this.createIndexMap(headers);
            
            // Validar que existan las columnas necesarias
            this.validateRequiredColumns(indexMap);
            
            // Iniciar una transacción para actualizar los usuarios
            await this.dataSource.transaction(async (manager) => {
                for (const row of rows) {
                    try {
                        // Extraer datos de la fila
                        const identification = row[indexMap['CEDULA']]?.toString().trim();
                        const registrationDateStr = row[indexMap['FECHA INGRESO']]?.toString().trim();
                        
                        // Validar que los datos necesarios estén presentes
                        if (!identification) {
                            throw new Error('Falta identificación del usuario');
                        }
                        
                        // Convertir la fecha de registro a un objeto Date
                        const registrationDate = this.parseExcelDate(registrationDateStr);
                        
                        // Si la fecha es "NO REGISTRA", simplemente continuamos con el siguiente usuario
                        if (!registrationDate && registrationDateStr && registrationDateStr.trim().toUpperCase() === 'NO REGISTRA') {
                            this.logger.log(`Usuario ${identification}: No hay fecha de registro para actualizar`);
                            continue;
                        }
                        
                        // Si hay un valor en la fecha pero no es válido, reportar error
                        if (registrationDateStr && !registrationDate && registrationDateStr.trim().toUpperCase() !== 'NO REGISTRA') {
                            throw new Error(`Formato de fecha inválido: ${registrationDateStr}`);
                        }
                        
                        // Buscar el usuario por identificación y cliente (si se proporciona clientId)
                        const queryBuilder = manager.createQueryBuilder(User, 'user')
                            .where('user.identification = :identification', { identification });
                            
                        if (clientId) {
                            queryBuilder.andWhere('user.client_id = :clientId', { clientId });
                        }
                        
                        const user = await queryBuilder.getOne();
                        
                        if (!user) {
                            processingStats.usersNotFoundCount++;
                            processingStats.usersNotFound.push(identification);
                            continue;
                        }
                        
                        // Solo actualizar la fecha si tenemos una fecha válida
                        if (registrationDate) {
                            // Actualizar la fecha de registro del usuario
                            user.created_at = registrationDate;
                            // user.updated_at = new Date(); // Fecha actual para update_at
                            
                            // Guardar los cambios
                            await manager.save(User, user);
                            processingStats.successCount++;
                        } else {
                            // Registrar que no se actualizó este usuario porque no tiene fecha
                            this.logger.log(`Usuario ${identification}: No se actualizó la fecha de registro`);
                            continue;
                        }
                        
                    } catch (error) {
                        processingStats.errorCount++;
                        const identification = row[indexMap['CEDULA']]?.toString() || 'Desconocido';
                        processingStats.errors.push({
                            identification,
                            error: error.message,
                        });
                        this.logger.error(`Error procesando usuario ${identification}: ${error.message}`);
                    }
                }
            });
    
            // Eliminar el archivo después de procesarlo
            await unlink(filePath);
    
            // Generar informe para usuarios no encontrados y errores
            await this.generateReportFile(processingStats);
    
            this.logger.log({
                message: 'Proceso completado',
                total: rows.length,
                success: processingStats.successCount,
                errors: processingStats.errorCount,
                errorDetails: processingStats.errors,
                usersNotFoundCount: processingStats.usersNotFoundCount,
                usersNotFound: processingStats.usersNotFound
            });
    
            return {
                message: 'Proceso completado',
                total: rows.length,
                success: processingStats.successCount,
                errors: processingStats.errorCount,
                errorDetails: processingStats.errors,
                usersNotFoundCount: processingStats.usersNotFoundCount,
                usersNotFound: processingStats.usersNotFound,
            };
        } catch (error) {
            this.logger.error(`Error procesando archivo: ${error.message}`);
            throw new HttpException(
                `Error procesando archivo: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
    
    private createIndexMap(headers: any[]): Record<string, number> {
        return headers.reduce((acc, header, index) => {
            if (header) {
                acc[header.toString().trim()] = index;
            }
            return acc;
        }, {});
    }
    
    private validateRequiredColumns(indexMap: Record<string, number>): void {
        const requiredColumns = ['CEDULA', 'FECHA INGRESO'];
        
        for (const column of requiredColumns) {
            if (indexMap[column] === undefined) {
                throw new Error(`La columna '${column}' es requerida en el archivo Excel`);
            }
        }
    }
    
    private parseExcelDate(dateStr: string): Date | null {
        try {
            // Verificar si es una fecha no registrada
            if (!dateStr || dateStr.trim().toUpperCase() === 'NO REGISTRA') {
                return null;
            }
            
            // Intentar diferentes formatos comunes de fecha
            const formats = [
                // Formato DD/MM/YYYY
                /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
                // Formato YYYY-MM-DD
                /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
                // Formato DD-MM-YYYY
                /^(\d{1,2})-(\d{1,2})-(\d{4})$/
            ];
            
            for (const format of formats) {
                const match = dateStr.match(format);
                if (match) {
                    // Extraer componentes de la fecha según el formato
                    let year, month, day;
                    
                    if (format === formats[0] || format === formats[2]) {
                        // Formato DD/MM/YYYY o DD-MM-YYYY
                        day = parseInt(match[1], 10);
                        month = parseInt(match[2], 10) - 1; // Los meses en JavaScript son 0-indexados
                        year = parseInt(match[3], 10);
                    } else {
                        // Formato YYYY-MM-DD
                        year = parseInt(match[1], 10);
                        month = parseInt(match[2], 10) - 1;
                        day = parseInt(match[3], 10);
                    }
                    
                    // Validar rangos de fecha
                    if (month < 0 || month > 11 || day < 1 || day > 31) {
                        continue;
                    }
                    
                    return new Date(year, month, day);
                }
            }
            
            // También manejar el número de serie de Excel (si es numérico)
            if (/^\d+(\.\d+)?$/.test(dateStr)) {
                // Convertir de número de serie de Excel a fecha JavaScript
                const excelEpoch = new Date(1899, 11, 30);
                const excelDate = parseFloat(dateStr);
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                return new Date(excelEpoch.getTime() + excelDate * millisecondsPerDay);
            }
            
            return null;
        } catch (error) {
            this.logger.error(`Error parseando fecha: ${dateStr}, ${error.message}`);
            return null;
        }
    }
    
    private async generateReportFile(stats: any): Promise<void> {
        try {
            // Crear un nuevo libro de trabajo y hoja
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Reporte');
            
            // Configurar encabezados para usuarios no encontrados
            worksheet.addRow(['REPORTE DE PROCESAMIENTO']);
            worksheet.addRow([]);
            worksheet.addRow(['Resumen']);
            worksheet.addRow(['Total procesados', stats.successCount + stats.errorCount + stats.usersNotFoundCount]);
            worksheet.addRow(['Exitosos', stats.successCount]);
            worksheet.addRow(['Errores', stats.errorCount]);
            worksheet.addRow(['Usuarios no encontrados', stats.usersNotFoundCount]);
            worksheet.addRow([]);
            
            // Sección de usuarios no encontrados
            if (stats.usersNotFound.length > 0) {
                worksheet.addRow(['USUARIOS NO ENCONTRADOS']);
                worksheet.addRow(['CEDULA']);
                
                stats.usersNotFound.forEach(identification => {
                    worksheet.addRow([identification]);
                });
                
                worksheet.addRow([]);
            }
            
            // Sección de errores
            if (stats.errors.length > 0) {
                worksheet.addRow(['ERRORES DE PROCESAMIENTO']);
                worksheet.addRow(['CEDULA', 'Error']);
                
                stats.errors.forEach(error => {
                    worksheet.addRow([error.identification, error.error]);
                });
            }
            
            // Crear directorio si no existe
            const reportsDir = path.join(process.cwd(), 'uploads/reports/updateData');
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            
            // Guardar el archivo
            const filename = `report-update-dates-${new Date().toISOString().replace(/:/g, '-')}.xlsx`;
            const filePath = path.join(reportsDir, filename);
            await workbook.xlsx.writeFile(filePath);
            
            this.logger.log(`Reporte generado: ${filePath}`);
        } catch (error) {
            this.logger.error(`Error generando reporte: ${error.message}`);
        }
    }

  async processUsersAndClubs(
    usersFilePath: string,
    clubsFilePath: string,
    clientId: number
  ): Promise<ProcessReport> {
    const report: ProcessReport = {
      totalUsersProcessed: 0,
      totalCoursesProcessed: 0,
      validUsers: 0,
      invalidUsers: 0,
      usersNotFound: 0,
      clubUsersDeleted: 0,
      clubUsersCreated: 0,
      errors: [],
      warnings: [],
      summary: ''
    };

    this.logger.log(`Starting process for clientId: ${clientId}`);

    try {
      // 1. Leer archivos Excel
      const usersData = await this.readUsersExcel(usersFilePath);
      const clubsData = await this.readClubsExcel(clubsFilePath);

      report.totalUsersProcessed = usersData.length;
      report.totalCoursesProcessed = clubsData.length;

      this.logger.log(`Read ${usersData.length} users and ${clubsData.length} clubs from Excel files`);

      // 2. Obtener clubs válidos de la base de datos
      const validClubs = await this.getValidClubs(clubsData, clientId, report);

      // 3. Procesar usuarios
      const validUserIds = await this.processUsers(usersData, clientId, report);

      // 4. Limpiar y asignar usuarios a clubs
      await this.cleanAndAssignUserClubs(validUserIds, validClubs, clientId, report);

      // 5. Generar resumen
      this.generateSummary(report);

      this.logger.log('Process completed successfully');
      return report;

    } catch (error) {
      this.logger.error('Error processing files:', error);
      report.errors.push({
        type: 'DATABASE_ERROR',
        message: `Error processing files: ${error.message}`,
        data: error
      });
      return report;
    }
  }

  private async readUsersExcel(filePath: string): Promise<UserRow[]> {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<UserRow>(worksheet);
      
      return data.filter(row => row.CEDULA && row.CEDULA.toString().trim() !== '');
    } catch (error) {
      this.logger.error('Error reading users Excel file:', error);
      throw new Error(`Error reading users Excel file: ${error.message}`);
    }
  }

  private async readClubsExcel(filePath: string): Promise<string[]> {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
      
      return data
        .map(row => row[0] as string | number | null | undefined)
        .filter((course): course is string | number => 
          course !== null && course !== undefined && course.toString().trim() !== ''
        )
        .map(course => course.toString().trim());
    } catch (error) {
      this.logger.error('Error reading clubs Excel file:', error);
      throw new Error(`Error reading clubs Excel file: ${error.message}`);
    }
  }

  private async getValidClubs(clubNames: string[], clientId: number, report: ProcessReport): Promise<Club[]> {
    const validClubs: Club[] = [];

    for (const clubName of clubNames) {
      try {
        const club = await this.clubRepository
          .createQueryBuilder('club')
          .leftJoinAndSelect('club.clubTranslation', 'translation')
          .where('club.client_id = :clientId', { clientId })
          .andWhere('(club.name = :clubName OR translation.title = :clubName)', { clubName })
          .getOne();

        if (club) {
          validClubs.push(club);
          this.logger.log(`Found club: ${clubName} (ID: ${club.id})`);
        } else {
          report.errors.push({
            type: 'CLUB_NOT_FOUND',
            message: `Club not found: ${clubName}`,
            data: { clubName, clientId }
          });
          this.logger.warn(`Club not found: ${clubName}`);
        }
      } catch (error) {
        report.errors.push({
          type: 'DATABASE_ERROR',
          message: `Error searching club: ${clubName}`,
          data: error
        });
      }
    }

    return validClubs;
  }

  private async processUsers(usersData: UserRow[], clientId: number, report: ProcessReport): Promise<number[]> {
    const validUserIds: number[] = [];

    for (const userRow of usersData) {
      if (!userRow.CEDULA) {
        report.warnings.push({
          type: 'EMPTY_ROW',
          message: 'Empty identification found',
          data: userRow
        });
        continue;
      }

      const identification = userRow.CEDULA.toString().trim();

      try {
        const user = await this.userRepository.findOne({
          where: {
            identification,
            client_id: clientId
          }
        });

        if (user) {
          validUserIds.push(user.id);
          report.validUsers++;
          this.logger.log(`Found user: ${identification} (ID: ${user.id})`);
        } else {
          report.usersNotFound++;
          report.errors.push({
            type: 'USER_NOT_FOUND',
            message: `User not found: ${identification}`,
            data: { identification, clientId }
          });
          this.logger.warn(`User not found: ${identification}`);
        }
      } catch (error) {
        report.invalidUsers++;
        report.errors.push({
          type: 'DATABASE_ERROR',
          message: `Error searching user: ${identification}`,
          data: error
        });
      }
    }

    return validUserIds;
  }

  private async cleanAndAssignUserClubs(
    validUserIds: number[], 
    validClubs: Club[], 
    clientId: number, 
    report: ProcessReport
  ): Promise<void> {
    const validClubIds = validClubs.map(club => club.id);

    try {
      // 1. Eliminar registros de usuarios que NO están en la lista válida
      // pero que tienen asignaciones a los clubs del cliente
      const deleteResult = await this.clubUserRepository
        .createQueryBuilder()
        .delete()
        .where('user_id NOT IN (:...validUserIds)', { validUserIds: validUserIds.length > 0 ? validUserIds : [-1] })
        .andWhere('club_id IN (SELECT id FROM clubs WHERE client_id = :clientId)', { clientId })
        .execute();

      report.clubUsersDeleted += deleteResult.affected || 0;

      // 2. Para cada usuario válido, eliminar asignaciones a clubs que NO están en la lista válida
      if (validUserIds.length > 0) {
        const cleanupResult = await this.clubUserRepository
          .createQueryBuilder()
          .delete()
          .where('user_id IN (:...validUserIds)', { validUserIds })
          .andWhere('club_id IN (SELECT id FROM clubs WHERE client_id = :clientId)', { clientId })
          .andWhere('club_id NOT IN (:...validClubIds)', { validClubIds: validClubIds.length > 0 ? validClubIds : [-1] })
          .execute();

        report.clubUsersDeleted += cleanupResult.affected || 0;
      }

      // 3. Asignar usuarios a clubs válidos (solo si no existen)
      for (const userId of validUserIds) {
        for (const club of validClubs) {
          const existingAssignment = await this.clubUserRepository.findOne({
            where: {
              user_id: userId,
              club_id: club.id
            }
          });

          if (!existingAssignment) {
            await this.clubUserRepository.save({
              user_id: userId,
              club_id: club.id
            });
            report.clubUsersCreated++;
            this.logger.log(`Assigned user ${userId} to club ${club.id}`);
          }
        }
      }

    } catch (error) {
      this.logger.error('Error managing club user assignments:', error);
      report.errors.push({
        type: 'DATABASE_ERROR',
        message: 'Error managing club user assignments',
        data: error
      });
    }
  }

  private generateSummary(report: ProcessReport): void {
    const errorCount = report.errors.length;
    const warningCount = report.warnings.length;

    report.summary = `
Process completed:
- ${report.totalUsersProcessed} users processed from Excel
- ${report.totalCoursesProcessed} courses processed from Excel  
- ${report.validUsers} valid users found in database
- ${report.usersNotFound} users not found in database
- ${report.clubUsersDeleted} club-user assignments deleted
- ${report.clubUsersCreated} club-user assignments created
- ${errorCount} errors encountered
- ${warningCount} warnings generated
    `.trim();

    if (errorCount > 0) {
      this.logger.warn(`Process completed with ${errorCount} errors`);
    } else {
      this.logger.log('Process completed successfully with no errors');
    }
  }
}