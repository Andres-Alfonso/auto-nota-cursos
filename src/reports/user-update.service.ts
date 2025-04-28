// users-update.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../progress-users/entities/user.entity';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

interface UpdateStatusItem {
  cedula: string;
  estado: string;
}

interface UpdateResult {
  updatedCount: number;
  notFoundCount: number;
  errorCount: number;
  reportPath?: string;
  reportName?: string;
  notFoundUsers: Array<{ cedula: string; error: string }>;
  errorUsers: Array<{ cedula: string; error: string }>;
}

@Injectable()
export class UsersUpdateService {
  private readonly logger = new Logger(UsersUpdateService.name);
  private readonly reportsDir = './reports';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {
    // Asegurar que existe el directorio de reportes
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async processUserStatusFile(filePath: string, clientId: number): Promise<UpdateResult> {
    // Resultado inicial
    const result: UpdateResult = {
      updatedCount: 0,
      notFoundCount: 0,
      errorCount: 0,
      notFoundUsers: [],
      errorUsers: [],
    };

    try {
      // Leer el archivo
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convertir a JSON
      const data = xlsx.utils.sheet_to_json<UpdateStatusItem>(worksheet);
      
      // Procesar cada registro
      for (const item of data) {
        await this.processUserStatusUpdate(item, clientId, result);
      }
      
      // Generar reporte de errores si hay usuarios no encontrados o con errores
      if (result.notFoundCount > 0 || result.errorCount > 0) {
        const reportResult = this.generateErrorReport(result);
        result.reportPath = reportResult.filePath;
        result.reportName = reportResult.fileName;
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error al procesar el archivo: ${error.message}`, error.stack);
      throw error;
    } finally {
      // Opcional: Eliminar el archivo subido después de procesarlo
      // if (fs.existsSync(filePath)) {
      //   fs.unlinkSync(filePath);
      // }
    }
  }

  private async processUserStatusUpdate(
    item: UpdateStatusItem,
    clientId: number,
    result: UpdateResult,
  ): Promise<void> {
    // Iniciar transacción para cada usuario
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Normalizar estado
      const statusValue = this.normalizeStatus(item.estado);
      
      // Buscar usuario por cédula y clientId
      const user = await queryRunner.manager.findOne(User, {
        where: { identification: item.cedula, client_id: clientId },
      });

      if (!user) {
        result.notFoundCount++;
        result.notFoundUsers.push({
          cedula: item.cedula,
          error: 'Usuario no encontrado',
        });
        await queryRunner.rollbackTransaction();
        return;
      }

      // Actualizar el status_validation
      user.status_validation = statusValue;
      await queryRunner.manager.save(User, user);

      this.logger.log(`Se actualiza usuario ${user.identification} con estado ${statusValue}`);


      // Confirmar transacción
      await queryRunner.commitTransaction();
      result.updatedCount++;
    } catch (error) {
      // Revertir transacción en caso de error
      await queryRunner.rollbackTransaction();
      result.errorCount++;
      result.errorUsers.push({
        cedula: item.cedula,
        error: error.message,
      });
      this.logger.error(`Error al actualizar usuario ${item.cedula}: ${error.message}`);
    } finally {
      // Liberar queryRunner
      await queryRunner.release();
    }
  }

  private normalizeStatus(status: string): string {
    const lowerStatus = String(status).toLowerCase().trim();
    
    if (['1', 'activo', 'active', 'on', 'true'].includes(lowerStatus)) {
      return '1';
    }
    
    if (['0', 'inactivo', 'inactive', 'off', 'false'].includes(lowerStatus)) {
      return '0';
    }
    
    // Valor predeterminado si no coincide con ninguno
    return '0';
  }

  private generateErrorReport(result: UpdateResult): { filePath: string; fileName: string } {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `error-report-${timestamp}.xlsx`;
    const filePath = path.join(this.reportsDir, fileName);

    // Crear un nuevo libro de trabajo
    const workbook = xlsx.utils.book_new();
    
    // Datos para el reporte
    const reportData = [
      // Resumen
      { Tipo: 'Resumen', Detalle: '' },
      { Tipo: 'Total procesados', Detalle: result.updatedCount + result.notFoundCount + result.errorCount },
      { Tipo: 'Actualizados correctamente', Detalle: result.updatedCount },
      { Tipo: 'No encontrados', Detalle: result.notFoundCount },
      { Tipo: 'Con errores', Detalle: result.errorCount },
      { Tipo: '', Detalle: '' },
      // Encabezados para usuarios no encontrados
      { Tipo: 'Usuarios no encontrados', Detalle: 'Error' },
    ];

    // Agregar usuarios no encontrados
    result.notFoundUsers.forEach(user => {
      reportData.push({ Tipo: user.cedula, Detalle: user.error });
    });
    
    reportData.push({ Tipo: '', Detalle: '' });
    reportData.push({ Tipo: 'Usuarios con errores', Detalle: 'Error' });

    // Agregar usuarios con errores
    result.errorUsers.forEach(user => {
      reportData.push({ Tipo: user.cedula, Detalle: user.error });
    });

    // Crear hoja y agregar al libro
    const worksheet = xlsx.utils.json_to_sheet(reportData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Reporte');

    // Guardar el archivo
    xlsx.writeFile(workbook, filePath);

    return { filePath, fileName };
  }
}