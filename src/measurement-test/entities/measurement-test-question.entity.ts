import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { MeasurementTestDimension } from './measurement-test-dimension.entity';
import { MeasurementTestOption } from './measurement-test-option.entity';
import { MeasurementTestAnswer } from './measurement-test-answer.entity';

@Entity({ name: 'measurement_test_questions' })
export class MeasurementTestQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'dimensions_measurement_id' })
  dimensionsMeasurementId: number;

  @Column()
  question: string;

  @Column()
  description: string;

  @Column({ name: 'positive_recommendation' })
  positiveRecommendation: string;

  @Column({ name: 'intermediate_recommendation' })
  intermediateRecommendation: string;

  @Column({ name: 'negative_recommendation' })
  negativeRecommendation: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => MeasurementTestDimension, (dimension) => dimension.questions)
  dimension: MeasurementTestDimension;

  @OneToMany(() => MeasurementTestOption, (option) => option.question)
  options: MeasurementTestOption[];

  @OneToMany(() => MeasurementTestAnswer, (answer) => answer.question)
  answers: MeasurementTestAnswer[];
}