import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiTokenGuard } from './guards/api-token.guard';
import { MetricGeneralController } from './metricsGeneral.controller';
import { MetricGeneralService } from './services/metrics-general.service';
import { MetricsCache } from './services/metrics-cache.service';

/**
 * Módulo del dashboard de métricas.
 *
 * Requisitos:
 *  - Variable de entorno METRICS_API_TOKEN: el MISMO token que Laravel manda
 *    en el header X-Metrics-Token (o Authorization: Bearer).
 *  - TypeORM ya configurado a la BD del LMS en el AppModule.
 *  - Dependencias: class-validator y class-transformer (@nestjs/jwt ya no se usa).
 *  - Si Laravel puede mandar listas grandes de userIds, sube el límite del
 *    body en main.ts:
 *      import { json } from 'express';
 *      app.use(json({ limit: '5mb' }));
 *
 * Ajusta las rutas de import a tu estructura de carpetas.
 */
@Module({
  imports: [ConfigModule],
  controllers: [MetricGeneralController],
  providers: [MetricGeneralService, MetricsCache, ApiTokenGuard],
})
export class MetricGeneralModule {}