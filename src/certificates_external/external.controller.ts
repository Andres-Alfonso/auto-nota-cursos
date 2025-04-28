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