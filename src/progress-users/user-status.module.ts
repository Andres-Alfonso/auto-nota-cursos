import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserStatusController } from './user-status.controller';
import { UserStatusService } from './services/user-status.service';

@Module({
  imports: [TypeOrmModule.forFeature()],
  controllers: [UserStatusController],
  providers: [UserStatusService],
})
export class UserStatusModule {}