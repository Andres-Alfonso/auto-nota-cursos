import { Controller, Get, Query, Post, Req, Res, UseGuards, Render, StreamableFile, UploadedFile, UseInterceptors  } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express'
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { diskStorage, Multer } from 'multer';

import { UsersUpdateService } from './user-update.service';

import * as path from 'path';

import { ReportFilterDto } from './dto/report-filter.dto';
// import { AuthGuard } from '@nestjs/passport';

import { UserReportData } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly usersUpdateService: UsersUpdateService,
  ) {}


  @Post('update-status')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const extension = path.extname(file.originalname);
          cb(null, `user-status-${uniqueSuffix}${extension}`);
        },
      }),
    }),
  )
  async updateUserStatus(
    @Req() req: Request,
    @Res() res: Response,
    @UploadedFile() file: Multer.File,
  ) {
    try {
      // Obtener clientId
      const clientId = parseInt(req.query.client_id as string);

      if (!clientId) {
        return res.status(400).json({ message: 'Se requiere client_id' });
      }

      if (!file) {
        return res.status(400).json({ message: 'Se requiere un archivo para la actualización' });
      }

      // Procesar archivo y actualizar estados
      const result = await this.usersUpdateService.processUserStatusFile(file.path, clientId);
      
      // Si se generó un reporte de errores
      if (result.reportPath && result.reportName) {
        return res.download(result.reportPath, result.reportName, (err) => {
          if (err) {
            console.error('Error al enviar el archivo:', err);
            if (!res.headersSent) {
              return res.status(500).json({
                message: 'Error al enviar el archivo de reporte',
                error: err.message,
              });
            }
          }
        });
      }

      // Si no hay reporte de errores, devolver el resultado
      return res.status(200).json({
        message: 'Proceso de actualización completado',
        updated: result.updatedCount,
        notFound: result.notFoundCount,
        errors: result.errorCount,
      });
    } catch (error) {
      console.error('Error en la actualización de usuarios:', error);
      return res.status(500).json({
        message: 'Error en la actualización de usuarios',
        error: error.message,
      });
    }
  }

  @Get('users')
  @Render('reports/users')
  async usersReportPage(
    @Req() req: Request,
    @Query() filter: ReportFilterDto,
  ) {
    // Obtener clientId de la sesión o del usuario autenticado
    const clientId = parseInt(req.query.client_id as string, 10) || 0;

    // Obtener datos básicos para la página
    const clubs = await this.reportsService.getClientClubs(clientId);
    const sections = await this.reportsService.getClientSections(clientId);
    const customFields = await this.reportsService.getClientCustomFields(clientId);
    
    return {
      title: 'Reporte de Usuarios',
      pageCss: 'reports',
      clubs,
      sections,
      customFields,
      startDate: filter.startDate || '',
      endDate: filter.endDate || '',
      clientId
    };
  }

  @Get('users/download')
  async downloadUserReport(
    @Req() req: Request,
    @Res() res: Response,
    @Query() filter: ReportFilterDto,
  ) {
    // Obtener clientId de la sesión o del usuario autenticado
    const clientId = parseInt(req.query.client_id as string);

    if (!clientId) {
      return res.status(400).json({ message: 'Se requiere client_id' });
    }

    try {
      // Generar reporte (ahora guarda el archivo en disco)
      const report = await this.reportsService.downloadUserReport(clientId, filter);
  
      // Opción 1: Enviar el archivo desde el sistema de archivos
      return res.download(report.filePath, report.fileName, (err) => {
        if (err) {
          console.error('Error al enviar el archivo:', err);
          // Si hay error al enviar el archivo, intentar responder con un error
          if (!res.headersSent) {
            res.status(500).json({ 
              message: 'Error al enviar el archivo',
              error: err.message 
            });
          }
        }
        
        // Opcional: Eliminar el archivo después de enviarlo
        // fs.unlinkSync(report.filePath);
      });
    } catch (error) {
      console.error('Error al generar el reporte:', error);
      return res.status(500).json({ 
        message: 'Error al generar el reporte',
        error: error.message 
      });
    }
  }

  @Get('users/preview')
  @Render('reports/preview')
  async previewUserReport(
    @Req() req: Request,
    @Query() filter: ReportFilterDto,
  ) {
    // Convertir client_id a número
    const clientId = parseInt(req.query.client_id as string, 10) || 0;
    
    if (!clientId) {
      return { 
        title: 'Error', 
        message: 'Se requiere client_id',
        error: true
      };
    }

    try {
      // Obtener una vista previa de los datos (primeras 10 filas)
      const previewData = await this.reportsService.getUserReportPreview(clientId, filter);
      
      return {
        title: 'Vista Previa del Reporte',
        pageCss: 'reports',
        previewData,
        startDate: filter.startDate || '',
        endDate: filter.endDate || '',
        clientId,
        columns: previewData.columns,
        rows: previewData.rows
      };
    } catch (error) {
      console.error('Error al obtener la vista previa:', error);
      return { 
        title: 'Error', 
        message: 'Error al obtener la vista previa',
        error: true,
        errorDetails: error.message
      };
    }
  }


  // @Post()
  // create(@Body() createReportDto: CreateReportDto) {
  //   return this.reportsService.create(createReportDto);
  // }

  // @Get()
  // findAll() {
  //   return this.reportsService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.reportsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateReportDto: UpdateReportDto) {
  //   return this.reportsService.update(+id, updateReportDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.reportsService.remove(+id);
  // }
}
