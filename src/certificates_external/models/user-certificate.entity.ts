// src/models/user-certificate.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_certificates_resources')
export class UserCertificate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  client_id: number;

  @Column()
  user_id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  file_path: string;

  @Column({ type: 'datetime', nullable: true })
  issue_date: Date;

  @Column({ type: 'datetime', nullable: true })
  expiry_date: Date;

  @Column({ name: 'additional_info', nullable: true })
  additional_info: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}