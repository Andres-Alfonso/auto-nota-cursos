import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { createHash } from 'crypto';

import { ApiTokenGuard } from './guards/api-token.guard';
import { OverviewRequestDto, ProgressDistributionRequestDto } from './dto/metric-general.dto';
import { MetricGeneralService, UserScope } from './services/metrics-general.service';
import { MetricsCache } from './services/metrics-cache.service';

/**
 * Endpoints de métricas del dashboard general.
 *
 * Contrato con Laravel (server a server):
 *  - Laravel resuelve TODOS los filtros y manda IDs ya resueltos
 *    (clubIds, userIds) más el clientId en el body. NestJS solo agrega.
 *  - Autenticación por token estático compartido (ApiTokenGuard). Como el
 *    token da acceso a cualquier clientId, estos endpoints deben consumirse
 *    SOLO desde el backend de Laravel: el token nunca va al navegador.
 *  - clubIds recibidos se intersectan contra los cursos reales del cliente.
 *  - Se usa POST porque las listas de IDs no caben cómodas en query string.
 */
@Controller('metrics/general')
@UseGuards(ApiTokenGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class MetricGeneralController {
  constructor(
    private readonly metrics: MetricGeneralService,
    private readonly cache: MetricsCache,
  ) {}

  /**
   * KPIs + ranking de usuarios + top de cursos + timeline, en paralelo.
   * Reemplaza el grueso de metricsGeneralStatus() de Laravel.
   */
  @Post('overview')
  async overview(@Body() dto: OverviewRequestDto) {
    const clientId = dto.clientId;
    const { startDate, endDate } = this.normalizeRange(dto.startDate, dto.endDate);
    const userScope: UserScope = dto.userIds ?? null;
    const rankingLimit = dto.rankingLimit ?? 10;
    const coursesLimit = dto.coursesLimit ?? 10;

    const clubIds = await this.metrics.resolveClientClubIds(clientId, dto.clubIds);

    const cacheKey = this.cacheKey('overview', clientId, {
      clubIds,
      userIds: this.sortedCopy(dto.userIds),
      startDate,
      endDate,
      rankingLimit,
      coursesLimit,
    });
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const { total: totalUsers, active: activeUsers } =
      await this.metrics.getUserCounts(clientId, userScope);

    const [indicators, userRanking, courseRanking, completionsTimeline] = await Promise.all([
      this.metrics.getGeneralIndicators({
        clientId, clubIds, startDate, endDate, totalUsers, activeUsers, userScope,
      }),
      this.metrics.getUserCompletionRanking({
        clientId, clubIds, startDate, endDate, limit: rankingLimit, userScope,
      }),
      this.metrics.getCourseCompletionStats({
        clubIds, startDate, endDate, limit: coursesLimit, userScope,
      }),
      this.metrics.getCompletionsTimeline({
        clubIds, startDate, endDate, userScope,
      }),
    ]);

    const payload = { indicators, userRanking, courseRanking, completionsTimeline };
    this.cache.set(cacheKey, payload);
    return payload;
  }

  /** Distribución de progreso por buckets (query pesada, endpoint aparte). */
  @Post('progress-distribution')
  async progressDistribution(@Body() dto: ProgressDistributionRequestDto) {
    const clientId = dto.clientId;
    const userScope: UserScope = dto.userIds ?? null;
    const clubIds = await this.metrics.resolveClientClubIds(clientId, dto.clubIds);

    const cacheKey = this.cacheKey('distribution', clientId, {
      clubIds,
      userIds: this.sortedCopy(dto.userIds),
      cap: dto.cap ?? 200,
    });
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const payload = await this.metrics.getProgressDistribution({
      clubIds,
      cap: dto.cap,
      userScope,
    });
    this.cache.set(cacheKey, payload);
    return payload;
  }

  // ============================ Helpers ============================

  /**
   * Réplica de los defaults de Laravel:
   *  start = ahora - 1 mes (o el recibido; fecha sola → 00:00:00)
   *  end   = SIEMPRE fin del día recibido (Carbon->endOfDay()), default hoy.
   * Usa hora local del servidor: debe coincidir con APP_TIMEZONE de Laravel.
   */
  private normalizeRange(start?: string, end?: string): { startDate: string; endDate: string } {
    const now = new Date();

    let startDate: string;
    if (start) {
      startDate = start.length === 10 ? `${start} 00:00:00` : start.replace('T', ' ');
    } else {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      startDate = this.toSqlDateTime(d);
    }

    const endDay = end ? end.slice(0, 10) : this.toSqlDateTime(now).slice(0, 10);

    return { startDate, endDate: `${endDay} 23:59:59` };
  }

  private toSqlDateTime(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  /** Copia ordenada para claves de caché estables (no muta el DTO) */
  private sortedCopy(ids?: number[]): number[] | null {
    return ids ? [...ids].sort((a, b) => a - b) : null;
  }

  private cacheKey(scope: string, clientId: number, payload: unknown): string {
    const hash = createHash('md5').update(JSON.stringify(payload)).digest('hex');
    return `${scope}:${clientId}:${hash}`;
  }
}