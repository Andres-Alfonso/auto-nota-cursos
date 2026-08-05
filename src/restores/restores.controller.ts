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