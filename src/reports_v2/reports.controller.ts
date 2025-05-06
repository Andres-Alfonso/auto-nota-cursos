import { 
    Controller, 
    Post, 
    Body, 
    HttpStatus, 
    Get,
    Param,
    Res,
    Logger,
    HttpException
  } from '@nestjs/common';
  import { CourseMetricsService } from './services/course-metrics.service';
  import { Response } from 'express';
  import * as path from 'path';
  import * as fs from 'fs';
  import { ConfigService } from '@nestjs/config';
  
  @Controller('api/reports')
  export class ReportsController {
    private readonly logger = new Logger(ReportsController.name);
  
    constructor(
      private readonly courseMetricsService: CourseMetricsService,
      private readonly configService: ConfigService,
    ) {}
  
    @Post('course-status')
    async generateCourseStatusReport(@Body() requestData: any) {
      try {
        // Extraer datos de la solicitud
        const { 
          client_id, 
          user_id, 
          start_date, 
          end_date, 
          search_user, 
          search_email, 
          search_identification, 
          search_course, 
          club_id 
        } = requestData;
  
        // Validar datos obligatorios
        if (!client_id || !user_id) {
          throw new HttpException('Faltan datos obligatorios', HttpStatus.BAD_REQUEST);
        }
  
        // Iniciar generación del reporte
        await this.courseMetricsService.generateCourseStatusReport(
          client_id,
          user_id,
          start_date ? new Date(start_date) : new Date(new Date().setMonth(new Date().getMonth() - 1)),
          end_date ? new Date(end_date) : new Date(),
          search_user || '',
          search_email || '',
          search_identification || '',
          search_course || '',
          club_id ? parseInt(club_id, 10) : undefined
        );
  
        return {
          statusCode: HttpStatus.ACCEPTED,
          message: 'La generación del reporte ha sido iniciada. Recibirás una notificación cuando esté listo.',
        };
      } catch (error) {
        this.logger.error(`Error al generar reporte: ${error.message}`, error.stack);
        throw new HttpException(
          error.message || 'Error al generar el reporte', 
          error.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
  
    // @Get('download/:filename')
    // async downloadReport(@Param('filename') filename: string, @Res() res: Response) {
    //   try {
    //     // Validar que el nombre del archivo sea seguro
    //     const sanitizedFilename = path.basename(filename);
    //     if (sanitizedFilename !== filename) {
    //       throw new HttpException('Nombre de archivo inválido', HttpStatus.BAD_REQUEST);
    //     }
  
    //     // Construir ruta del archivo
    //     const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
    //     const filePath = path.join(uploadsDir, 'reports', sanitizedFilename);
  
    //     // Verificar si el archivo existe
    //     if (!fs.existsSync(filePath)) {
    //       throw new HttpException('Archivo no encontrado', HttpStatus.NOT_FOUND);
    //     }
  
    //     // Enviar el archivo como descarga
    //     return res.download(filePath, sanitizedFilename, (err) => {
    //       if (err) {
    //         this.logger.error(`Error al descargar el archivo: ${err.message}`, err.stack);
    //         throw new HttpException(
    //           'Error al descargar el archivo', 
    //           HttpStatus.INTERNAL_SERVER_ERROR
    //         );
    //       }
    //     });
    //   } catch (error) {
    //     this.logger.error(`Error al descargar reporte: ${error.message}`, error.stack);
    //     throw new HttpException(
    //       error.message || 'Error al descargar el reporte', 
    //       error.status || HttpStatus.INTERNAL_SERVER_ERROR
    //     );
    //   }
    // }

    @Get('download/:filename')
    async downloadReport(@Param('filename') filename: string, @Res() res: Response) {
        try {
        // Validar que el nombre del archivo sea seguro
        const sanitizedFilename = path.basename(filename);
        if (sanitizedFilename !== filename) {
            throw new HttpException('Nombre de archivo inválido', HttpStatus.BAD_REQUEST);
        }

        // Construir ruta del archivo
        const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
        const filePath = path.join(uploadsDir, 'reports', sanitizedFilename);

        // Verificar si el archivo existe
        if (!fs.existsSync(filePath)) {
            throw new HttpException('Archivo no encontrado', HttpStatus.NOT_FOUND);
        }

        // Determinar el Content-Type basado en la extensión
        const isCSV = sanitizedFilename.toLowerCase().endsWith('.csv');
        
        // Configurar headers para descarga
        res.set({
            'Content-Type': isCSV ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
            'Content-Length': fs.statSync(filePath).size
        });

        // Para CSV, agregar BOM para que Excel interprete correctamente caracteres UTF-8
        if (isCSV) {
            const fileContent = fs.readFileSync(filePath);
            // Verificar si ya tiene BOM
            if (fileContent.length < 3 || 
                fileContent[0] !== 0xEF || 
                fileContent[1] !== 0xBB || 
                fileContent[2] !== 0xBF) {
            // Agregar BOM al inicio
            const bomBuffer = Buffer.from([0xEF, 0xBB, 0xBF]);
            res.write(bomBuffer);
            }
        }

        // Enviar el archivo como stream para mejor manejo de memoria
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        // res.on('finish', () => {
        //   fs.unlink(filePath, (err) => {
        //     if (err) {
        //       this.logger.error(`Error al eliminar archivo ${filePath}: ${err.message}`);
        //     } else {
        //       this.logger.log(`Archivo eliminado: ${filePath}`);
        //     }
        //   });
        // });

        // Manejar errores de stream
        fileStream.on('error', (err) => {
            this.logger.error(`Error al leer el archivo: ${err.message}`, err.stack);
            if (!res.headersSent) {
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                message: 'Error al descargar el archivo'
            });
            }
        });

        } catch (error) {
        this.logger.error(`Error al descargar reporte: ${error.message}`, error.stack);
        throw new HttpException(
            error.message || 'Error al descargar el reporte', 
            error.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
        }
    }
}