import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SectionClubs } from './section-clubs.entity';
import { User } from './user.entity';

@Entity('detail_user_sections_clubs')
export class DetailUserSectionsClub {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  section_id: number;

  @Column({ type: 'int', unsigned: true })
  user_id: number;

  @Column({ type: 'text', nullable: true })
  value: string;

  @ManyToOne(() => SectionClubs, section => section.detailUserSectionsClub)
  @JoinColumn({ name: 'section_id' })
  section: SectionClubs;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}