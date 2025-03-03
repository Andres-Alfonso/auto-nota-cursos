import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressController } from './progress-users/progress.controller';
import { ProgressService } from './progress-users/progress.service';
import { ProgressModule } from './progress-users/progress.module';

@Module({
  imports: [
    ProgressModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: '',
      port: 3307,
      username: '',
      password: '',
      database: '',
      autoLoadEntities: true,
      synchronize: false,
    })
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
