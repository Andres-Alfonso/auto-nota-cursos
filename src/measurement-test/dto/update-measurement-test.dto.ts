import { PartialType } from '@nestjs/mapped-types';
import { CreateMeasurementTestDto } from './create-measurement-test.dto';

export class UpdateMeasurementTestDto extends PartialType(CreateMeasurementTestDto) {}