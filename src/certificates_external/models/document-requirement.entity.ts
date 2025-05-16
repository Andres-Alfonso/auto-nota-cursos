// src/models/document-requirement.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Documents } from './documents.entity';

@Entity('document_requirements')
export class DocumentRequirement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  document_id: number;

  @Column()
  title: string;

  @ManyToOne(() => Documents, document => document.documentRequirements)
  @JoinColumn({ name: 'document_id' })
  document: Documents;
}