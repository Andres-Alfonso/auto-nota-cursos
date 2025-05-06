import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Evaluation } from './evaluation.entity';

@Entity('evaluation_history')
export class EvaluationHistory {  // Cambié el nombre de la clase para que coincida con el nombre de la tabla
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  evaluation_id: number;

  @Column({ type: 'int', unsigned: true })
  user_id: number;

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

  @ManyToOne(() => Evaluation)
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: Evaluation;

  // Métodos equivalentes a los del modelo Laravel
  getUser(): Promise<User> {
    return Promise.resolve(this.user);
  }

  getEvaluation(): Promise<Evaluation> {
    return Promise.resolve(this.evaluation);
  }
}