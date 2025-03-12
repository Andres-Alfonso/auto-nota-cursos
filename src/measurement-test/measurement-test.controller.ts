import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MeasurementTestService } from './measurement-test.service';
import { diskStorage, Multer } from 'multer';

import { CreateMeasurementTestDto } from './dto/create-measurement-test.dto';
import { UpdateMeasurementTestDto } from './dto/update-measurement-test.dto';
import { UploadMeasurement } from './dto/upload-measurement-dto';

@Controller('measurement-test')
export class MeasurementTestController {
  constructor(private readonly measurementTestService: MeasurementTestService) {}


  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Multer.File,
    @Body() uploadMeasurementDto: UploadMeasurement,
  ) {
    // Aseguramos que clubId sea un número
    const measurement_id = parseInt(uploadMeasurementDto.measurement_id.toString(), 10);
    return this.measurementTestService.processExcelFile(file.path, measurement_id);
  }

  @Post()
  create(@Body() createMeasurementTestDto: CreateMeasurementTestDto) {
    return this.measurementTestService.create(createMeasurementTestDto);
  }

  @Get()
  findAll() {
    return this.measurementTestService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.measurementTestService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMeasurementTestDto: UpdateMeasurementTestDto) {
    return this.measurementTestService.update(+id, updateMeasurementTestDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.measurementTestService.remove(+id);
  }
}
