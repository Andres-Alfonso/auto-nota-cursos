import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { VideoRoom } from './videoroom.entity';

@Entity('evaluations')
export class Evaluation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  name: string;

  @Column()
  attempts: number;

  @Column()
  enable_certificate: number;

  @Column()
  approving_note: number;

  @Column()
  type: string;
}
