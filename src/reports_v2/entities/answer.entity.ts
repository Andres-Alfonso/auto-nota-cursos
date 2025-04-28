import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('answers')
export class Answer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ name: 'evaluation_id' })
  evaluation_id: number;
}