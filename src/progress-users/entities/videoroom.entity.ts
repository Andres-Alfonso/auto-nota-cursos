import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Club } from './club.entity';

@Entity('videorooms')
export class VideoRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  title: string;

  @Column({ length: 300, nullable: true })
  description: string;

  @Column({ length: 191, nullable: true })
  thumbnail: string;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  public: boolean;

  @Column({ type: 'int', unsigned: true })
  club_id: number;

  @ManyToOne(() => Club, (club) => club.videoRooms, { nullable: false })
  @JoinColumn({ name: 'club_id' })  // Asegura la relación con la columna correcta
  club: Club;

}
