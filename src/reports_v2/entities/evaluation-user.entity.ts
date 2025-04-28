import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('evaluation_users')
export class EvaluationUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ name: 'evaluation_id' })
  evaluation_id: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  nota: number;

  @Column({ default: 0 })
  approved: number;
}