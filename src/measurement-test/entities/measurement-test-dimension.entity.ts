import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { MeasurementTest } from './measurement-test.entity';
import { MeasurementTestQuestion } from './measurement-test-question.entity';

@Entity({ name: 'measurement_test_dimensions' })
export class MeasurementTestDimension {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'measurement_id' })
  measurementId: number;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => MeasurementTest, (measurementTest) => measurementTest.dimensions)
  measurementTest: MeasurementTest;

  @OneToMany(() => MeasurementTestQuestion, (question) => question.dimension)
  questions: MeasurementTestQuestion[];
}