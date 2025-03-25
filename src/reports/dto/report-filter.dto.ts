import { IsOptional, IsDateString, IsNumber, IsInt, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  client_id?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  format?: string;
  
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;
  
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 10;
}