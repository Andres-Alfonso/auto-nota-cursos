import { Type } from "class-transformer";
import { IsNotEmpty, IsOptional } from "class-validator";

// DTO para el endpoint
export class UpdateEvaluationProgressDto {
  @IsNotEmpty()
  @Type(() => Number)
  client_id: number;

  @IsNotEmpty()
  @Type(() => Number)
  club_id: number;

  @IsNotEmpty()
  @Type(() => Number)
  evaluation_id: number;

  @IsOptional()
  @Type(() => Number)
  user_id?: number;
}