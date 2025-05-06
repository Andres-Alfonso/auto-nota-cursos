// src/progress/progress.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UpdateProgressController } from './update-progress.controller';
import { UpdateProgressService } from './services/update-progress.service';
import { User } from '../progress-users/entities/user.entity';
import { VideoRoom } from '../progress-users/entities/videoroom.entity';
import { Club } from '../progress-users/entities/club.entity';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { GeneralProgressVideoRoom } from '../progress-users/entities/general-progress-videoroom.entity';
import { UserProgressVideoRoom } from '../progress-users/entities/user-progress-videoroom.entity';
import { UserProgressTaskVideoRoom } from '../progress-users/entities/user-pogress-task-videoroom.entity';
import { UserProgressForumVideoRoom } from '../progress-users/entities/user-progress-wall-videoroom.entity';
import { UserProgressActivityVideoRoom } from '../progress-users/entities/user-progress-activity-videoroom.entity';
import { UserProgressEvaluationVideoRoom } from '../progress-users/entities/user-progress-evaluation-videoroom.entity';
import { UserProgressSelftEvaluationVideoRoom } from '../progress-users/entities/user-progress-selft-evaluation.entity';
import { DetailActivitiesVideoRoom } from '../progress-users/entities/detail-activity-videoroom.entity';
import { DetailSelftEvaluationVideoRoom } from '../progress-users/entities/detail-selft-evaluation-videoroom.entity';
import { DetailWallsVideoRoom } from '../progress-users/entities/detail-walls-videoroom.entity';
import { Content } from '../progress-users/entities/content.entity';
import { SectionClubs } from '../progress-users/entities/section-clubs.entity';
import { DetailSectionClub } from '../progress-users/entities/detail-section-club.entity';
import { ClubUser } from '../progress-users/entities/club-user.entity';
import { DetailUserSectionsClub } from '../progress-users/entities/detail-user-sections-club.entity';
import { EvaluationClub } from '../progress-users/entities/evaluation-club.entity';
import { Evaluation } from '../progress-users/entities/evaluation.entity';
import { Certificate } from '../progress-users/entities/certificate.entity';
import { EvaluationUser } from '../progress-users/entities/evaluation-user.entity';
import { Answer } from '../progress-users/entities/answer.entity';
import { DetailEvaluationVideoRoom } from '../progress-users/entities/detail-evaluation-videoroom.entity';
import { EvaluationHistory } from 'src/progress-users/entities/evaluation-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EvaluationHistory, DetailEvaluationVideoRoom, User, VideoRoom, Club, GeneralProgressVideoRoom, UserProgressVideoRoom, UserProgressTaskVideoRoom, UserProgressForumVideoRoom, UserProgressActivityVideoRoom, UserProgressEvaluationVideoRoom, UserProgressSelftEvaluationVideoRoom, DetailActivitiesVideoRoom, DetailSelftEvaluationVideoRoom, DetailWallsVideoRoom, Content, ClubUser, SectionClubs, DetailSectionClub, DetailUserSectionsClub, EvaluationClub, Evaluation, Certificate, EvaluationUser, Answer]),
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
  controllers: [UpdateProgressController],
  providers: [UpdateProgressService],
  exports: [TypeOrmModule]
})
export class UpdateProgressModule {}