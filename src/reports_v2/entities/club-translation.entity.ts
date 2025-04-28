import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { Club } from './club.entity';

@Entity('club_translations')
export class ClubTranslation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id' })
  club_id: number;

  @Column()
  locale: string;

  @Column()
  title: string;

  @ManyToOne(() => Club, club => club.clubTranslation)
  @JoinColumn({ name: 'club_id' })
  club: Club;
}