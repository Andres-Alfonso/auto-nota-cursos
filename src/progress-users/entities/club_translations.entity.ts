// club-translation.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Club } from './club.entity';

@Entity('club_translations')
export class ClubTranslation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column()
  locale: string;

  @Column()
  club_id: number;

  @ManyToOne(() => Club, club => club.translations)
  @JoinColumn({ name: 'club_id' })
  club: Club;
}