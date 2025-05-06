// src/modules/progress/progress.controller.ts
import { Controller, Post, Body, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateProgressService } from './services/update-progress.service';
import { UploadProgressDto } from '../progress-users/dto/upload-progress.dto';
import { diskStorage, Multer } from 'multer';

@Controller('update-progress')
export class UpdateProgressController {
  constructor(private readonly updateProgressService: UpdateProgressService) {}

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

    return this.updateProgressService.processExcelFile(file.path, clubId, clientId);
  }
}