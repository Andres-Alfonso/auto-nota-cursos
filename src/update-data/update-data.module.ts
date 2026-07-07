// src/progress/progress.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../progress-users/entities/user.entity';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UpdateDataController } from './update-data.controller';
import { UpdateDataService } from './services/update-data.service';
import { Club } from 'src/reports_v2/entities/club.entity';
import { ClubUser } from 'src/reports_v2/entities/club-user.entity';
import { Client } from 'src/reports_v2/entities/client.entity';
import { CustomField } from 'src/reports_v2/entities/custom-field.entity';
import { CustomFieldOption } from 'src/reports_v2/entities/custom-field-option.entity';
import { UserCustomField } from 'src/reports_v2/entities/user-custom-field.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Club, ClubUser, Client, CustomField, CustomFieldOption, UserCustomField]),
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
  controllers: [UpdateDataController],
  providers: [UpdateDataService],
  exports: [TypeOrmModule]
})
export class UpdateDataModule {}