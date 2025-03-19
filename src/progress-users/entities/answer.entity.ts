import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Evaluation } from './evaluation.entity';

@Entity('answers')
export class Answer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  user_id: number;

  @Column({ type: 'int', unsigned: true })
  evaluation_id: number;

  @Column({ type: 'text', nullable: true })
  response: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Evaluation, evaluation => evaluation.answers)
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: Evaluation;
}