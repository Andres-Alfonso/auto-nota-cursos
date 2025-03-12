import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { MeasurementTestQuestion } from './measurement-test-question.entity';
import { MeasurementTestAnswer } from './measurement-test-answer.entity';

@Entity({ name: 'measurement_test_options' })
export class MeasurementTestOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'question_measurement_id' })
  questionMeasurementId: number;

  @Column({ name: 'option_text' })
  optionText: string;

  @Column()
  score: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => MeasurementTestQuestion, (question) => question.options)
  question: MeasurementTestQuestion;

  @OneToMany(() => MeasurementTestAnswer, (answer) => answer.option)
  answers: MeasurementTestAnswer[];
}