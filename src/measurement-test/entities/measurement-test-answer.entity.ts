import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { MeasurementTestQuestion } from './measurement-test-question.entity';
import { MeasurementTestOption } from './measurement-test-option.entity';
import { User } from '../../progress-users/entities/user.entity';

@Entity({ name: 'measurement_test_answers' })
export class MeasurementTestAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'question_measurement_id' })
  questionMeasurementId: number;

  @Column({ name: 'option_measurement_id' })
  optionMeasurementId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => MeasurementTestQuestion, (question) => question.answers)
  question: MeasurementTestQuestion;

  @ManyToOne(() => MeasurementTestOption, (option) => option.answers)
  option: MeasurementTestOption;

  @ManyToOne(() => User, (user) => user.measurementTestAnswers)
  user: User;
}