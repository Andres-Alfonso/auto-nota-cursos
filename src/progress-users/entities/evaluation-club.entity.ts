import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Evaluation } from './evaluation.entity';
import { Club } from './club.entity';

@Entity('evaluation_clubs')
export class EvaluationClub {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  evaluation_id: number;

  @Column({ type: 'int', unsigned: true })
  club_id: number;

  @ManyToOne(() => Evaluation, evaluation => evaluation.evaluationClubs)
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: Evaluation;

  @ManyToOne(() => Club, club => club.evaluationClubs)
  @JoinColumn({ name: 'club_id' })
  club: Club;
}