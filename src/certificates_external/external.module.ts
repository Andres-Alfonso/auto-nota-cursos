import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ExternalController } from './external.controller';
import { ExternalService } from './services/external.service';


@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
    ]),
  ],
  controllers: [ExternalController],
  providers: [ExternalService],
  exports: [ExternalService],
})
export class ExternalModule {}