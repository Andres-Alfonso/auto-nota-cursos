import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProgressUsersModule } from './progress-users/progress-users.module';

@Module({
  imports: [
    ProgressUsersModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: '192.168.0.102',
      port: 3307,
      username: 'desarrollo',
      password: 'vBUKqppYNWsA7R',
      database: 'devel-myzonego',
      autoLoadEntities: true,
      synchronize: false,
    })
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
