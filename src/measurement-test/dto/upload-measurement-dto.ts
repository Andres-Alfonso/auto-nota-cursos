// src/modules/progress/dto/upload-progress.dto.ts
import { IsNotEmpty, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadMeasurement {
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  measurement_id: number;
}