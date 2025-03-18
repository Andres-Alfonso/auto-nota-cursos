// src/modules/progress/progress.controller.ts
import { Controller, Post, Body, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProgressService } from './progress.service';
import { UploadProgressDto } from './dto/upload-progress.dto';
import { diskStorage, Multer } from 'multer';
import { UploadProgressEvaluationDto } from './dto/update-progress-evaluation.dto';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Multer.File,
    @Body() uploadProgressDto: UploadProgressDto,
  ) {
    // Convertir clubId a número o pasar undefined si no existe
    const clubId = uploadProgressDto.clubId ? 
      parseInt(uploadProgressDto.clubId.toString(), 10) : 
      undefined;

    // Pasamos clientId si está disponible
    const clientId = uploadProgressDto.clientId 
      ? parseInt(uploadProgressDto.clientId.toString(), 10) 
      : undefined;

    return this.progressService.processExcelFile(file.path, clubId, clientId);
  }

  @Post('upload/evaluation')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileEvaluation(
    @UploadedFile() file: Multer.File,
    @Body() UploadProgressEvaluationDto: UploadProgressEvaluationDto,
  ) {
    // Aseguramos que evaluationId sea un número
    const evaluationId = parseInt(UploadProgressEvaluationDto.evaluationId.toString(), 10);
    return this.progressService.processExcelFile(file.path, evaluationId);
  }
}