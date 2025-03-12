import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { MeasurementTestDimension } from './measurement-test-dimension.entity';
import { Club } from '../../progress-users/entities/club.entity';

@Entity({ name: 'measurement_test' })
export class MeasurementTest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id' })
  clientId: number;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  attempts: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => MeasurementTestDimension, (dimension) => dimension.measurementTest)
  dimensions: MeasurementTestDimension[];

  @ManyToMany(() => Club)
  @JoinTable({
    name: 'measurement_test_club',
    joinColumn: { name: 'measurement_test_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'club_id', referencedColumnName: 'id' }
  })
  clubsTest: Club[];
}