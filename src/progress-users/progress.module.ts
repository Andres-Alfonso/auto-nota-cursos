// src/progress/progress.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { User } from './entities/user.entity';
import { VideoRoom } from './entities/videoroom.entity';
import { Club } from './entities/club.entity';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { GeneralProgressVideoRoom } from './entities/general-progress-videoroom.entity';
import { UserProgressVideoRoom } from './entities/user-progress-videoroom.entity';
import { UserProgressTaskVideoRoom } from './entities/user-pogress-task-videoroom.entity';
import { UserProgressForumVideoRoom } from './entities/user-progress-wall-videoroom.entity';
import { UserProgressActivityVideoRoom } from './entities/user-progress-activity-videoroom.entity';
import { UserProgressEvaluationVideoRoom } from './entities/user-progress-evaluation-videoroom.entity';
import { UserProgressSelftEvaluationVideoRoom } from './entities/user-progress-selft-evaluation.entity';
import { DetailActivitiesVideoRoom } from './entities/detail-activity-videoroom.entity';
import { DetailSelftEvaluationVideoRoom } from './entities/detail-selft-evaluation-videoroom.entity';
import { DetailWallsVideoRoom } from './entities/detail-walls-videoroom.entity';
import { Content } from './entities/content.entity';
import { SectionClubs } from './entities/section-clubs.entity';
import { DetailSectionClub } from './entities/detail-section-club.entity';
import { ClubUser } from './entities/club-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, VideoRoom, Club, GeneralProgressVideoRoom, UserProgressVideoRoom, UserProgressTaskVideoRoom, UserProgressForumVideoRoom, UserProgressActivityVideoRoom, UserProgressEvaluationVideoRoom, UserProgressSelftEvaluationVideoRoom, DetailActivitiesVideoRoom, DetailSelftEvaluationVideoRoom, DetailWallsVideoRoom, Content, ClubUser]),
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          return cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [TypeOrmModule]
})
export class ProgressModule {}