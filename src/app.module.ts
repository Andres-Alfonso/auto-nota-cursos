import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressModule } from './progress-users/progress.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { MeasurementTestModule } from './measurement-test/measurement-test.module';
import { Club } from './progress-users/entities/club.entity';
import { AppService } from './app.service';
import { ClubTranslation } from './progress-users/entities/club_translations.entity';
// import { ReportsModule } from './reports/reports.module';
import { ReportsModule } from './reports_v2/reports.module';
import { UserStatusModule } from './progress-users/user-status.module';
import { ExternalModule } from './certificates_external/external.module';
import { UpdateProgressModule } from './update-progress/update-progress.module';
import { UpdateDataModule } from './update-data/update-data.module';


@Module({
  imports: [
    // Importar y configurar ConfigModule
    ConfigModule.forRoot({
      isGlobal: true, // Disponible en toda la aplicación
      envFilePath: '.env', // Ruta al archivo .env
    }),
    ProgressModule,
    MeasurementTestModule,
    // ReportsModule,
    UserStatusModule,
    ReportsModule,
    ExternalModule,
    UpdateProgressModule,
    UpdateDataModule,
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
