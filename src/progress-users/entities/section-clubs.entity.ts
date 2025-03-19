import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Club } from './club.entity';
import { DetailSectionClub } from './detail-section-club.entity';
import { DetailUserSectionsClub } from './detail-user-sections-club.entity';

@Entity('secction_clubs')
export class SectionClubs {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 191, nullable: true })
  imagen: string;

  @Column({ type: 'int', unsigned: true })
  client_id: number;

  @Column({ type: 'int', unsigned: true })
  creator_user: number;

  @Column()
  orden: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  enable_certificate: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_user' })
  userCreation: User;

  @OneToMany(() => Club, club => club.section)
  clubs: Club[];

  @OneToMany(() => DetailSectionClub, detail => detail.section)
  detailSectionClub: DetailSectionClub[];

  @OneToMany(() => DetailUserSectionsClub, detail => detail.section)
  detailUserSectionsClub: DetailUserSectionsClub[];
}