import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToMany } from 'typeorm';
import { VideoRoom } from './videoroom.entity';
import { MeasurementTest } from '../../measurement-test/entities/measurement-test.entity';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  name: string;

  // Relación uno a muchos (un club puede tener varias salas de video)
  @OneToMany(() => VideoRoom, (videoRoom) => videoRoom.club)
  videoRooms: VideoRoom[];

  @ManyToMany(() => MeasurementTest, (measurementTest) => measurementTest.clubsTest)
  measurementTests: MeasurementTest[];
}
