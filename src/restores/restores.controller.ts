import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { RestoresService } from './restores.service';
import { RestoreClubDto } from './dto/restore-club.dto';

/**
 * ⚠ PROTEGER ESTE CONTROLLER: agrega tu guard de admin/superadmin
 * (@UseGuards(...)) antes de desplegar. Un restore escribe directo
 * en producción y el body puede traer credenciales de BD.
 *
 * Flujo recomendado:
 *   1. POST /restores/clubs/123/check     → ¿está en el backup? ¿qué hay en prod?
 *   2. POST /restores/clubs/123           → dry-run (default): reporte sin escribir
 *   3. POST /restores/clubs/123  body: { "dryRun": false, "confirm": true }
 */
@Controller('restores')
export class RestoresController {
    constructor(private readonly restoresService: RestoresService) { }

    /** Diagnóstico: club en backup (conteos de hijos) + estado del id en producción. */
    @Post('clubs/:id/check')
    check(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RestoreClubDto,
    ) {
        return this.restoresService.checkClub({ ...dto, clubId: id });
    }

    /**
     * Trae SOLO los usuarios únicos de club_user (backup) que falten en
     * producción. No toca ids ocupados por otra persona (email distinto) —
     * esos quedan en `conflicts` para revisión manual. dryRun por default.
     */
    @Post('clubs/:id/users')
    restoreUsers(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RestoreClubDto,
    ) {
        return this.restoresService.restoreClubUsers({ ...dto, clubId: id });
    }

    /**
     * Matricula (club_user) a los alumnos del backup en un club que YA EXISTE
     * en producción (no lo crea ni lo remapea). Deduplica por user_id
     * priorizando la fila con fecha real; salta usuarios sin cuenta en
     * producción — corre /users primero si hace falta. dryRun por default.
     */
    @Post('clubs/:id/memberships')
    restoreMemberships(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RestoreClubDto,
    ) {
        return this.restoresService.restoreClubMemberships({ ...dto, clubId: id });
    }

    /**
     * Restaura el club. Sin body (o dryRun:true) → simulación con rollback.
     * El run real exige { dryRun: false, confirm: true }.
     */
    @Post('clubs/:id')
    restore(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RestoreClubDto,
    ) {
        return this.restoresService.restoreClub({ ...dto, clubId: id });
    }
}