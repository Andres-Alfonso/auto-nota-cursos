// src/models/user-document.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Documents } from './documents.entity';

@Entity('user_documents')
export class UserDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  document_id: number;

  @Column({ nullable: true })
  file_path: string;

  @Column({ type: 'datetime', nullable: true })
  issue_date: Date;

  @Column({ type: 'datetime', nullable: true })
  expiry_date: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Documents)
  @JoinColumn({ name: 'document_id' })
  document: Documents;
}