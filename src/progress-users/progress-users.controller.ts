import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ProgressUsersService } from './progress-users.service';
import { CreateProgressUserDto } from './dto/create-progress-user.dto';
import { UpdateProgressUserDto } from './dto/update-progress-user.dto';
import { UploadProgressDto } from './dto/upload-progress.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('progress')
export class ProgressUsersController {
  constructor(private readonly progressUsersService: ProgressUsersService) {}

  @Post()
  create(@Body() createProgressUserDto: CreateProgressUserDto) {
    return this.progressUsersService.create(createProgressUserDto);
  }

  @Get()
  findAll() {
    return this.progressUsersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.progressUsersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: number, @Body() updateProgressUserDto: UpdateProgressUserDto) {
    return this.progressUsersService.update(+id, updateProgressUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.progressUsersService.remove(+id);
  }
}
