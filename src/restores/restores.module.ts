import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestoresController } from './restores.controller';
import { RestoresService } from './restores.service';
import { RESTORE_ENTITIES } from './entities/entities';

@Module({
  imports: [
    // Registra las entidades en la conexión DEFAULT (producción).
    // La conexión al backup se crea dinámicamente en el service con
    // new DataSource({ ..., entities: RESTORE_ENTITIES }).
    //
    // Nota: si TypeORM se queja por tener dos clases mapeando 'clubs'
    // (la de progress-users y esta), reutiliza allá estas entidades o
    // viceversa — no pueden convivir dos metadatos conflictivos raros,
    // aunque normalmente TypeORM lo tolera sin problema.
    TypeOrmModule.forFeature(RESTORE_ENTITIES),
  ],
  controllers: [RestoresController],
  providers: [RestoresService]
})
export class RestoresModule { }
