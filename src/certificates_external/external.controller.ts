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


// Definir el lugar donde se guardarán los archivos
const storageConfig = diskStorage({
  destination: (req, file, cb) => {
    // Crear directorio si no existe
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const certificatesDir = path.join(uploadsDir, 'certificates_externals');
    
    if (!fs.existsSync(certificatesDir)) {
      fs.mkdirSync(certificatesDir, { recursive: true });
    }
    
    cb(null, certificatesDir);
  },
  filename: (req, file, cb) => {
    // Obtener nombre de archivo de los datos JSON
    const jsonData = JSON.parse(req.body.data);
    const fileName = jsonData.filename || `certificados_externos_${Date.now()}.csv`;
    cb(null, fileName);
  }
});

@Controller('api/external')
export class ExternalController {
  private readonly logger = new Logger(ExternalController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly certificateExternalService: ExternalService
  ) {}

  @Post('export-certificates')
  @UseInterceptors(FileInterceptor('file', { storage: storageConfig }))
  async exportCertificates(
    @UploadedFile() file: Multer.File,
    @Body('data') dataString: string
  ) {
    try {
      const data = JSON.parse(dataString);
      const { clientId, startDate, endDate, filename } = data;
      
      if (!file) {
        throw new HttpException('No se proporcionó ningún archivo', HttpStatus.BAD_REQUEST);
      }
      
      // La URL base para la descarga del archivo
      const baseUrl = this.configService.get<string>('APP_URL', 'https://homologation-notes.kalmsystem.com');
      const downloadUrl = `${baseUrl}/api/external/download-certificate/${filename}`;
      
      this.logger.log(`Archivo CSV generado: ${file.path}`);
      
      return {
        statusCode: HttpStatus.OK,
        message: 'Archivo CSV generado correctamente',
        downloadUrl: downloadUrl,
        fileName: filename
      };
    } catch (error) {
      this.logger.error(`Error al generar el archivo CSV: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al generar el archivo CSV', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  @Get('download-certificate/:fileName')
  async downloadCertificate(
    @Param('fileName') fileName: string,
    @Res() res: Response
  ) {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const filePath = path.join(uploadsDir, 'certificates_externals', fileName);
      
      if (!fs.existsSync(filePath)) {
        throw new HttpException('El archivo no existe', HttpStatus.NOT_FOUND);
      }
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      
      // Crear un stream de lectura y enviarlo como respuesta
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      this.logger.error(`Error al descargar el archivo: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al descargar el archivo', 
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