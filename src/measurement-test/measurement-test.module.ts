import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MeasurementTestService } from './measurement-test.service';
import { MeasurementTestController } from './measurement-test.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Club } from 'src/progress-users/entities/club.entity';
import { MeasurementTest } from './entities/measurement-test.entity';
import { MeasurementTestDimension } from './entities/measurement-test-dimension.entity';
import { MeasurementTestQuestion } from './entities/measurement-test-question.entity';
import { MeasurementTestOption } from './entities/measurement-test-option.entity';
import { MeasurementTestAnswer } from './entities/measurement-test-answer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Club, MeasurementTest, MeasurementTestDimension, MeasurementTestQuestion, MeasurementTestOption, MeasurementTestAnswer]),
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
  controllers: [MeasurementTestController],
  providers: [MeasurementTestService],
})
export class MeasurementTestModule {}
