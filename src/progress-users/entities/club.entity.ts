import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { VideoRoom } from './videoroom.entity';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  name: string;

  // Relación uno a muchos (un club puede tener varias salas de video)
  @OneToMany(() => VideoRoom, (videoRoom) => videoRoom.club)
  videoRooms: VideoRoom[];
}
