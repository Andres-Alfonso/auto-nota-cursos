// src/models/documents.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { DocumentRequirement } from './document-requirement.entity';
import { UserDocument } from './user-document.entity';

@Entity('documents')
export class Documents {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  client_id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  type_document_category: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => DocumentRequirement, requirement => requirement.document)
  documentRequirements: DocumentRequirement[];

  @OneToMany(() => UserDocument, userDocument => userDocument.document)
  userDocuments: UserDocument[];
}