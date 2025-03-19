import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Evaluation } from './evaluation.entity';

@Entity('evaluation_users')
export class EvaluationUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  user_id: number;

  @Column({ type: 'int', unsigned: true })
  evaluation_id: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  nota: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  approved: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Evaluation, evaluation => evaluation.evaluationUsers)
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: Evaluation;
}