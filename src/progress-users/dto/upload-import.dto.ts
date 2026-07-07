import { IsNumber, IsOptional, IsString, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportUsersDto {
  @Type(() => Number)
  @IsNumber()
  client: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  club?: number[];

  @IsOptional()
  @IsString()
  selected_filters?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  section_id?: number;

  @Type(() => Number)
  @IsNumber()
  user_id: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  role_user?: number;

  @Type(() => Number)
  @IsNumber()
  client_id: number;
}
