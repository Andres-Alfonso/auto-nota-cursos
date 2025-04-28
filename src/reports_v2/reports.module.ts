import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ReportsController } from './reports.controller';
import { CourseMetricsService } from './services/course-metrics.service';
import { NotificationZone } from './entities/notification-zone.entity';
import { User } from './entities/user.entity';
import { Club } from './entities/club.entity';
import { VideoRoom } from './entities/video-room.entity';
import { ClubUser } from './entities/club-user.entity';
import { GeneralProgressVideoRoom } from './entities/general-progress-video-room.entity';
import { Evaluation } from './entities/evaluation.entity';
import { EvaluationClub } from './entities/evaluation-club.entity';
import { EvaluationUser } from './entities/evaluation-user.entity';
import { Answer } from './entities/answer.entity';
import { ClubTranslation } from './entities/club-translation.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      NotificationZone,
      User,
      Club,
      VideoRoom,
      ClubUser,
      GeneralProgressVideoRoom,
      Evaluation,
      EvaluationClub,
      EvaluationUser,
      Answer,
      ClubTranslation
    ]),
  ],
  controllers: [ReportsController],
  providers: [CourseMetricsService],
  exports: [CourseMetricsService],
})
export class ReportsModule {}