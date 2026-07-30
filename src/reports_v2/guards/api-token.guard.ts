import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Valida un token estático compartido con Laravel.
 *
 * Laravel manda el token en el header:
 *   X-Metrics-Token: <token>      (o  Authorization: Bearer <token>)
 *
 * y aquí se compara contra METRICS_API_TOKEN del .env.
 *
 * IMPORTANTE: como el token es estático y da acceso a cualquier clientId,
 * estos endpoints son SOLO server-a-server (Laravel → NestJS). El token
 * nunca debe llegar al navegador. Idealmente NestJS escucha en localhost
 * o red interna.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const received = this.extractToken(request);
    const expected = this.config.get<string>('METRICS_API_TOKEN');

    // Fail-closed: sin token configurado, nadie entra
    if (!expected) {
      throw new UnauthorizedException('METRICS_API_TOKEN no configurado en el servicio');
    }

    if (!received || !this.safeEquals(received, expected)) {
      throw new UnauthorizedException('Token inválido');
    }

    return true;
  }

  private extractToken(request: any): string | null {
    const headerToken = request.headers?.['x-metrics-token'];
    if (typeof headerToken === 'string' && headerToken.length > 0) {
      return headerToken;
    }

    const auth: string = request.headers?.authorization ?? '';
    const [scheme, token] = auth.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }

  /**
   * Comparación en tiempo constante. Se hashean ambos valores primero para
   * igualar longitudes (timingSafeEqual exige buffers del mismo tamaño).
   */
  private safeEquals(a: string, b: string): boolean {
    const hashA = createHash('sha256').update(a).digest();
    const hashB = createHash('sha256').update(b).digest();
    return timingSafeEqual(hashA, hashB);
  }
}