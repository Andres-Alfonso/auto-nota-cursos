import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ClubTranslation } from './club-translation.entity';
import { VideoRoom } from './video-room.entity';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id' })
  client_id: number;
  
  @Column({ name: 'inten_hour', default: 1 })
  inten_hour: number;
  
  @Column({ name: 'name', nullable: true })
  name: string;
  
  @Column({ default: false })
  public: boolean;
  
  @Column({ nullable: true })
  imagen: string;
  
  @Column({ nullable: true })
  abbreviation: string;
  
  @Column({ name: 'not_visible', default: false })
  not_visible: boolean;

  @OneToMany(() => ClubTranslation, translation => translation.club)
  clubTranslation: ClubTranslation[];

  @OneToMany(() => VideoRoom, videoRoom => videoRoom.club)
  videoRooms: VideoRoom[];
}