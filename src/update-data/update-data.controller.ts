import { Controller, Post, Body, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateDataService } from './services/update-data.service';
import { UploadProgressDto } from '../progress-users/dto/upload-progress.dto';
import { diskStorage, Multer } from 'multer';

@Controller('update-data')
export class UpdateDataController {
  constructor(private readonly UpdateDataService: UpdateDataService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Multer.File,
    @Body() uploadProgressDto: UploadProgressDto,
  ) {

    // Pasamos clientId si está disponible
    const clientId = uploadProgressDto.clientId 
      ? parseInt(uploadProgressDto.clientId.toString(), 10) 
      : undefined;

    return this.UpdateDataService.processExcelFile(file.path, clientId);
  }
}