import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { Evaluation } from './evaluation.entity';

@Entity('evaluation_clubs')
export class EvaluationClub {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'evaluation_id' })
  evaluation_id: number;

  @Column({ name: 'club_id' })
  club_id: number;

  @ManyToOne(() => Evaluation, evaluation => evaluation.evaluationClubs)
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: Evaluation;
}