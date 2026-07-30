// import {
//     CanActivate,
//     createParamDecorator,
//     ExecutionContext,
//     Injectable,
//     UnauthorizedException,
// } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';

// /**
//  * Valida el JWT HS256 firmado por Laravel con el secreto compartido
//  * (METRICS_JWT_SECRET, configurado en el JwtModule del módulo).
//  *
//  * Claims esperados: { client_id: number, iat: number, exp: number }
//  *
//  * El client_id validado queda en request.clientId — es la ÚNICA fuente
//  * de identidad del cliente; nunca se acepta por body ni query.
//  */
// @Injectable()
// export class LaravelJwtGuard implements CanActivate {
//     constructor(private readonly jwtService: JwtService) { }

//     canActivate(context: ExecutionContext): boolean {
//         const request = context.switchToHttp().getRequest();
//         const authHeader: string = request.headers?.authorization ?? '';
//         const [scheme, token] = authHeader.split(' ');

//         if (scheme !== 'Bearer' || !token) {
//             throw new UnauthorizedException('Falta el token Bearer');
//         }

//         try {
//             const payload = this.jwtService.verify(token);
//             const clientId = Number(payload.client_id ?? payload.clientId);

//             if (!Number.isInteger(clientId) || clientId <= 0) {
//                 throw new Error('client_id ausente en el token');
//             }

//             request.clientId = clientId;
//             return true;
//         } catch {
//             throw new UnauthorizedException('Token inválido o expirado');
//         }
//     }
// }

// /** Extrae el client_id ya validado por LaravelJwtGuard */
// export const ClientId = createParamDecorator(
//     (_data: unknown, context: ExecutionContext): number =>
//         context.switchToHttp().getRequest().clientId,
// );