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

@Module({
  imports: [
    TypeOrmModule.forFeature([User, VideoRoom, Club, GeneralProgressVideoRoom]),
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