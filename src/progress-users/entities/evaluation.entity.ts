import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { VideoRoom } from './videoroom.entity';
import { Certificate } from './certificate.entity';
import { EvaluationClub } from './evaluation-club.entity';
import { EvaluationUser } from './evaluation-user.entity';
import { Answer } from './answer.entity';

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

  @OneToMany(() => Certificate, certificate => certificate.evaluation)
  certificates: Certificate[];

  @OneToMany(() => EvaluationClub, evaluationClub => evaluationClub.evaluation)
  evaluationClubs: EvaluationClub[];

  @OneToMany(() => EvaluationUser, evaluationUser => evaluationUser.evaluation)
  evaluationUsers: EvaluationUser[];

  @OneToMany(() => Answer, answer => answer.evaluation)
  answers: Answer[];
}
