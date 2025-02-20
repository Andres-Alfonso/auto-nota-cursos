import { Module } from '@nestjs/common';
import { ProgressUsersService } from './progress-users.service';
import { ProgressUsersController } from './progress-users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressUser } from './entities/progress-user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProgressUser])],
  controllers: [ProgressUsersController],
  providers: [ProgressUsersService],
})
export class ProgressUsersModule {}
