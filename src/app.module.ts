import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressController } from './progress-users/progress.controller';
import { ProgressService } from './progress-users/progress.service';
import { ProgressModule } from './progress-users/progress.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { MeasurementTestModule } from './measurement-test/measurement-test.module';
import { Club } from './progress-users/entities/club.entity';
import { AppService } from './app.service';
import { ClubTranslation } from './progress-users/entities/club_translations.entity';
import { SectionClubs } from './progress-users/entities/section-clubs.entity';
import { DetailSectionClub } from './progress-users/entities/detail-section-club.entity';
import { ReportsModule } from './reports/reports.module';


@Module({
  imports: [
    // Importar y configurar ConfigModule
    ConfigModule.forRoot({
      isGlobal: true, // Disponible en toda la aplicación
      envFilePath: '.env', // Ruta al archivo .env
    }),
    ProgressModule,
    MeasurementTestModule,
    ReportsModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3307,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      autoLoadEntities: true,
      synchronize: false,
    }),
    TypeOrmModule.forFeature([Club, ClubTranslation]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
