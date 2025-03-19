import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SectionClubs } from './section-clubs.entity';

@Entity('detail_section_clubs')
export class DetailSectionClub {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  section_id: number;

  @Column({ type: 'text', nullable: true })
  value: string;

  @ManyToOne(() => SectionClubs, section => section.detailSectionClub)
  @JoinColumn({ name: 'section_id' })
  section: SectionClubs;
}