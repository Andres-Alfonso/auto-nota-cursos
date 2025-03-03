// src/modules/progress/progress.controller.ts
import { Controller, Post, Body, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProgressService } from './progress.service';
import { UploadProgressDto } from './dto/upload-progress.dto';
import { diskStorage, Multer } from 'multer';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Multer.File,
    @Body() uploadProgressDto: UploadProgressDto,
  ) {
    // Aseguramos que clubId sea un número
    const clubId = parseInt(uploadProgressDto.clubId.toString(), 10);
    return this.progressService.processExcelFile(file.path, clubId);
  }
}