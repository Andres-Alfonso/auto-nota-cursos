import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EvaluationClub } from './evaluation-club.entity';

@Entity('evaluations')
export class Evaluation {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  name: string;
  
  @Column({ nullable: true })
  description: string;
  
  @Column({ nullable: true })
  expiration_date: Date;
  
  @Column({ name: 'completion_time', nullable: true })
  completion_time: number;

  @Column({ name: 'approving_note', default: 0 })
  approving_note: number;
  
  @Column({ default: 1 })
  attempts: number;

  @Column({ name: 'enable_certificate', default: false })
  enable_certificate: boolean;

  @Column({ default: 'test' })
  type: string;
  
  @Column({ name: 'order_type', default: 'sequential' })
  order_type: string;
  
  @Column({ name: 'user_status', default: 1 })
  user_status: number;
  
  @Column({ name: 'status_delete', default: 0 })
  status_delete: number;
  
  @Column({ name: 'enable_ponderation', default: 0 })
  enable_ponderation: boolean;
  
  @Column({ name: 'ponderation_content_hidden', default: 0 })
  ponderation_content_hidden: boolean;
  
  @Column({ name: 'share_evaluation', default: 0 })
  share_evaluation: boolean;
  
  @Column({ nullable: true })
  image: string;
  
  @Column({ name: 'date_start', nullable: true })
  date_start: Date;
  
  @Column({ name: 'enable_code_certificate', default: 0 })
  enable_code_certificate: boolean;
  
  @Column({ name: 'eneable_nit_certificate', default: 0 })
  eneable_nit_certificate: boolean;
  
  @Column({ name: 'show_contens_suport', default: 0 })
  show_contens_suport: boolean;
  
  @Column({ name: 'location_additional_questions', nullable: true })
  location_additional_questions: string;
  
  @Column({ name: 'from_category', default: 0 })
  from_category: boolean;

  @OneToMany(() => EvaluationClub, evaluationClub => evaluationClub.evaluation)
  evaluationClubs: EvaluationClub[];
}