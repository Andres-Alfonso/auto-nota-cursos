import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// Importar todas las entidades necesarias
import { User } from '../progress-users/entities/user.entity';
import { Club } from '../progress-users/entities/club.entity';
import { SectionClubs } from '../progress-users/entities/section-clubs.entity';
import { CustomField } from '../progress-users/entities/custom-field.entity';
import { UserCustomField } from '../progress-users/entities/user-custom-field.entity';
import { ClubUser } from '../progress-users/entities/club-user.entity';
import { GeneralProgressVideoRoom } from '../progress-users/entities/general-progress-videoroom.entity';
import { VideoRoom } from '../progress-users/entities/videoroom.entity';
import { Certificate } from '../progress-users/entities/certificate.entity';
import { Evaluation } from '../progress-users/entities/evaluation.entity';
import { EvaluationClub } from '../progress-users/entities/evaluation-club.entity';
import { EvaluationUser } from '../progress-users/entities/evaluation-user.entity';
import { Answer } from '../progress-users/entities/answer.entity';
import { ClubTranslation } from '../progress-users/entities/club_translations.entity';
import { DetailSectionClub } from 'src/progress-users/entities/detail-section-club.entity';
import { DetailUserSectionsClub } from 'src/progress-users/entities/detail-user-sections-club.entity';
import { CustomFieldOption } from 'src/progress-users/entities/custom-field-option.entity';
import { UsersUpdateService } from './user-update.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Club,
      SectionClubs,
      CustomField,
      UserCustomField,
      ClubUser,
      GeneralProgressVideoRoom,
      VideoRoom,
      Certificate,
      Evaluation,
      EvaluationClub,
      EvaluationUser,
      Answer,
      ClubTranslation,
      DetailUserSectionsClub,
      CustomFieldOption,
      DetailSectionClub,
      SectionClubs
      
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, UsersUpdateService],
  exports: [ReportsService, UsersUpdateService],
})
export class ReportsModule {}