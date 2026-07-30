import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** 'YYYY-MM-DD' o 'YYYY-MM-DD HH:mm:ss' (separador espacio o T) */
const DATE_RX = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$/;

/**
 * Contrato con Laravel (server a server): aquí llegan IDs YA RESUELTOS.
 * Laravel aplica los filtros (curso, sección, estado, campos personalizados,
 * búsquedas de usuario) y manda el resultado:
 *
 *  - clientId              → obligatorio; viene del backend de Laravel.
 *                            Con token estático la identidad del cliente
 *                            viaja en el body, por eso estos endpoints son
 *                            solo server-a-server.
 *  - clubIds omitido o []  → todos los cursos del cliente
 *  - userIds omitido       → sin filtro de usuarios
 *  - userIds []            → los filtros no coincidieron con nadie (todo en cero)
 */
export class MetricsBaseFilterDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  clubIds?: number[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @ArrayMaxSize(50000)
  userIds?: number[];
}

export class MetricsRangeFilterDto extends MetricsBaseFilterDto {
  @IsOptional()
  @Matches(DATE_RX, { message: 'startDate debe ser YYYY-MM-DD o YYYY-MM-DD HH:mm:ss' })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_RX, { message: 'endDate debe ser YYYY-MM-DD o YYYY-MM-DD HH:mm:ss' })
  endDate?: string;
}

/** Body de POST /metrics/general/overview */
export class OverviewRequestDto extends MetricsRangeFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  rankingLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  coursesLimit?: number;
}

/** Body de POST /metrics/general/progress-distribution (no usa fechas) */
export class ProgressDistributionRequestDto extends MetricsBaseFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  cap?: number;
}