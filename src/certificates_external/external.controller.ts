import { 
  Controller, 
  Post, 
  Body, 
  HttpStatus, 
  Get,
  Param,
  Res,
  Logger,
  HttpException,
  UseInterceptors,
  UploadedFile,
  Query
} from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, Multer } from 'multer';

import { ExternalService } from './services/external.service';


@Controller('api/external')
export class ExternalController {
  private readonly logger = new Logger(ExternalController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly certificateExternalService: ExternalService
  ) {}

  @Post('export-certificates')
  async exportCertificatesToCSV(@Body() requestData: any, @Res() res: Response) {
    try {
      const { groupedCertificates, startDate, endDate, clientId } = requestData;
      
      if (!groupedCertificates || !startDate || !endDate || !clientId) {
        throw new HttpException('Faltan datos obligatorios', HttpStatus.BAD_REQUEST);
      }
      
      // Nombre del archivo
      const fileName = `certificados_externos_${startDate}_${endDate}.csv`;
      
      // Configurar headers para la respuesta
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Cache-Control', 'must-revalidate, post-check=0, pre-check=0');
      res.setHeader('Expires', '0');
      
      // Crear el stream de escritura directamente a la respuesta
      const csvStream = this.createCsvStream(groupedCertificates);
      
      // Pipe el stream directamente a la respuesta
      csvStream.pipe(res);
    } catch (error) {
      this.logger.error(`Error al exportar certificados: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al exportar certificados', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private createCsvStream(groupedCertificates: any) {
    // Importar módulo para crear CSV
    const { Transform } = require('stream');
    const { stringify } = require('csv-stringify');
    
    // Crear stream de transformación para procesar los datos
    const transformStream = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        callback(null, chunk);
      }
    });
    
    // Configurar el stringifier CSV
    const stringifier = stringify({
      header: true,
      columns: {
        'Estado': 'estado',
        'Cedula': 'cedula',
        'Nombre': 'nombre',
        'Apellido': 'apellido',
        'Correo': 'correo',
        'Nombre del Certificado': 'certificado',
        'Fecha de Emisión': 'fechaEmision',
        'Fecha de Vencimiento': 'fechaVencimiento',
        'Estado del Certificado': 'estadoCertificado',
        'Ruta de archivo': 'rutaArchivo'
      }
    });
    
    // Escribir los datos en el stream
    process.nextTick(() => {
      // Escribir cada certificado en el stream
      for (const certificate of groupedCertificates) {
        const certificateName = certificate.name;
        
        // Procesar cada usuario con sus certificados
        for (const user of certificate.users) {
          // Obtener nombre y apellido separados
          const fullName = user.user_name;
          const nameParts = fullName ? fullName.split(' ', 2) : ['N/A', 'N/A'];
          const firstName = nameParts[0] || 'N/A';
          const lastName = nameParts[1] || 'N/A';
          const statusValidation = user.user_status;
          
          // Obtener estado
          const status = this.translateStatus(user.status);
          const statusUser = statusValidation;
          
          // Procesar cada certificado del usuario
          for (const userCertificate of user.certificates) {
            const issueDate = userCertificate.issue_date || 'N/A';
            const expiryDate = userCertificate.expiry_date || 'N/A';
            const filePath = userCertificate.file_path || '';
            
            // Escribir fila en el CSV
            transformStream.push({
              estado: statusUser,
              cedula: user.user_identification,
              nombre: firstName,
              apellido: lastName,
              correo: user.user_email,
              certificado: certificateName,
              fechaEmision: issueDate,
              fechaVencimiento: expiryDate,
              estadoCertificado: status,
              rutaArchivo: filePath
            });
          }
        }
      }
      
      // Finalizar el stream
      transformStream.push(null);
    });
    
    // Conectar el stream de transformación con el stringifier
    return transformStream.pipe(stringifier);
  }

  private translateStatus(status: string): string {
    // Esta función debería traducir los códigos de estado a textos descriptivos
    // similar a la función en Laravel
    switch (status) {
      case 'active':
        return 'Activo';
      case 'expired':
        return 'Vencido';
      case 'expiring_soon':
        return 'Por vencer';
      default:
        return status || 'Desconocido';
    }
  }

  @Post('certificates-external')
  async processCorrectCertificatesExternal(@Body() requestData: any) {
    try {
      // Extraer datos de la solicitud
      const { 
        client_id
      } = requestData;

      // Validar datos obligatorios
      if (!client_id) {
        throw new HttpException('Faltan datos obligatorios', HttpStatus.BAD_REQUEST);
      }

      await this.certificateExternalService.testCertificateExternals(client_id);

      return {
        statusCode: HttpStatus.ACCEPTED,
        message: 'Se estan buscando certificados del cliente.',
      }
    } catch (error) {
      this.logger.error(`Error al generar reporte: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al generar el reporte', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Endpoint para probar la sincronización de certificados y documentos para un cliente
   * No realiza cambios, solo muestra qué asociaciones se crearían
   */
  @Post('test-sync-certificates-documents')
  async testSyncCertificatesDocuments(@Body() requestData: any) {
    try {
      const { client_id } = requestData;

      if (!client_id) {
        throw new HttpException('El ID del cliente es obligatorio', HttpStatus.BAD_REQUEST);
      }

      const testResults = await this.certificateExternalService.testSyncClientCertificatesWithDocuments(client_id);

      return {
        statusCode: HttpStatus.OK,
        message: 'Prueba de sincronización completada exitosamente',
        data: testResults
      };
    } catch (error) {
      this.logger.error(`Error en prueba de sincronización: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al realizar la prueba de sincronización', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Endpoint para ejecutar la sincronización real de certificados y documentos para un cliente
   * Crea las asociaciones necesarias en la tabla document_user
   */
  @Post('sync-certificates-documents')
  async syncCertificatesDocuments(@Body() requestData: any) {
    try {
      const { client_id } = requestData;

      if (!client_id) {
        throw new HttpException('El ID del cliente es obligatorio', HttpStatus.BAD_REQUEST);
      }

      const syncResults = await this.certificateExternalService.syncClientCertificatesWithDocuments(client_id);

      return {
        statusCode: HttpStatus.OK,
        message: 'Sincronización completada exitosamente',
        data: syncResults
      };
    } catch (error) {
      this.logger.error(`Error en sincronización: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al realizar la sincronización', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Endpoint para sincronizar certificados y documentos para un usuario específico
   */
  @Post('sync-user-certificates')
  async syncUserCertificates(@Body() requestData: any) {
    try {
      const { user_id } = requestData;

      if (!user_id) {
        throw new HttpException('El ID del usuario es obligatorio', HttpStatus.BAD_REQUEST);
      }

      const syncResults = await this.certificateExternalService.syncUserCertificatesWithDocuments(user_id);

      return {
        statusCode: HttpStatus.OK,
        message: 'Sincronización del usuario completada exitosamente',
        data: syncResults
      };
    } catch (error) {
      this.logger.error(`Error en sincronización de usuario: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al realizar la sincronización del usuario', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}