import { Injectable } from '@nestjs/common';
import { CreateMeasurementTestDto } from './dto/create-measurement-test.dto';
import { UpdateMeasurementTestDto } from './dto/update-measurement-test.dto';

@Injectable()
export class MeasurementTestService {

  async processExcelFile(filePath: string, clubId: number): Promise<any> {
    try {
      
    } catch (error) {
      
    }
  }


  create(createMeasurementTestDto: CreateMeasurementTestDto) {
    return 'This action adds a new measurementTest';
  }

  findAll() {
    return `This action returns all measurementTest`;
  }

  findOne(id: number) {
    return `This action returns a #${id} measurementTest`;
  }

  update(id: number, updateMeasurementTestDto: UpdateMeasurementTestDto) {
    return `This action updates a #${id} measurementTest`;
  }

  remove(id: number) {
    return `This action removes a #${id} measurementTest`;
  }
}
