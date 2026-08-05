import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RestoreClubDto {
    /** ID del club a restaurar (tal como está en el backup). */
    @Type(() => Number) @IsInt() @Min(1)
    clubId: number;

    /**
     * true (default en el controller) → todo corre dentro de una transacción
     * que se REVIERTE al final: reporte exacto de qué pasaría (colisiones,
     * remapeos, filas saltadas) sin escribir nada en producción.
     * false → commit real. Requiere confirm: true.
     */
    @IsOptional() @IsBoolean()
    dryRun?: boolean;

    /** Guardia extra: el run real exige dryRun:false Y confirm:true. */
    @IsOptional() @IsBoolean()
    confirm?: boolean;

    /**
     * SET FOREIGN_KEY_CHECKS=0 durante la copia. Solo si la BD tiene
     * constraints reales y algún insert falla por orden. Laravel 5
     * normalmente no las tiene.
     */
    @IsOptional() @IsBoolean()
    disableFkChecks?: boolean;

    // ─── Credenciales del backup (override; si faltan → .env BACKUP_DB_*) ───
    @IsOptional() @IsString() backupHost?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) backupPort?: number;
    @IsOptional() @IsString() backupUser?: string;
    @IsOptional() @IsString() backupPassword?: string;
    @IsOptional() @IsString() backupDatabase?: string;
}