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

@Injectable()
export class UpdateDataService {
    private readonly logger = new Logger(UpdateDataService.name);

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
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
}