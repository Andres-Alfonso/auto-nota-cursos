import { PartialType } from '@nestjs/mapped-types';
import { CreateProgressUserDto } from './create-progress-user.dto';

export class UpdateProgressUserDto extends PartialType(CreateProgressUserDto) {}
