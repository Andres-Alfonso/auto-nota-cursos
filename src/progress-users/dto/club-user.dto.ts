import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadFileClubUser {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  clubId?: number;

  @IsOptional()
  @Transform(({ value }) => value ? parseInt(value, 10) : undefined)
  @IsNumber()
  clientId?: number;
}