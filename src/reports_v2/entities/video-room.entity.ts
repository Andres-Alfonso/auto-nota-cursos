import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { Club } from './club.entity';

@Entity('videorooms')
export class VideoRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id' })
  club_id: number;

  @Column({ name: 'enable_modules', default: false })
  enable_modules: boolean;

  @Column({ default: false })
  public: boolean;

  @ManyToOne(() => Club, club => club.videoRooms)
  @JoinColumn({ name: 'club_id' })
  club: Club;
}
