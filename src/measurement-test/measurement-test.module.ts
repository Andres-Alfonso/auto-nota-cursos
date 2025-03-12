import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MeasurementTestService } from './measurement-test.service';
import { MeasurementTestController } from './measurement-test.controller';
import { Club } from 'src/progress-users/entities/club.entity';
import { MeasurementTest } from './entities/measurement-test.entity';
import { MeasurementTestDimension } from './entities/measurement-test-dimension.entity';
import { MeasurementTestQuestion } from './entities/measurement-test-question.entity';
import { MeasurementTestOption } from './entities/measurement-test-option.entity';
import { MeasurementTestAnswer } from './entities/measurement-test-answer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Club, MeasurementTest, MeasurementTestDimension, MeasurementTestQuestion, MeasurementTestOption, MeasurementTestAnswer]),
  ],
  controllers: [MeasurementTestController],
  providers: [MeasurementTestService],
})
export class MeasurementTestModule {}
