import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Evaluation } from './evaluation.entity';

@Entity('certificates')
export class Certificate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  evaluation_id: number;

  @Column({ type: 'int', nullable: true })
  hours: number;

  @ManyToOne(() => Evaluation, evaluation => evaluation.certificates)
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: Evaluation;
}