import { MeasurementTestAnswer } from '../../measurement-test/entities/measurement-test-answer.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  identification: string;

  @Column()
  name: string;

  @Column()
  last_name: string;

  @Column()
  email: string;

  @Column({ name: 'client_id' })
  client_id: number;

  @OneToMany(() => MeasurementTestAnswer, (answer) => answer.user)
  measurementTestAnswers: MeasurementTestAnswer[];
}