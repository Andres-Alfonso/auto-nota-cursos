import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToMany } from 'typeorm';
import { VideoRoom } from './videoroom.entity';
import { MeasurementTest } from '../../measurement-test/entities/measurement-test.entity';
import { ClubTranslation } from './club_translations.entity';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  name: string;

  @Column({type: 'int', unsigned: true})
  client_id: number;

  // Relación uno a muchos (un club puede tener varias salas de video)
  @OneToMany(() => VideoRoom, (videoRoom) => videoRoom.club)
  videoRooms: VideoRoom[];

  @ManyToMany(() => MeasurementTest, (measurementTest) => measurementTest.clubsTest)
  measurementTests: MeasurementTest[];

  @OneToMany(() => ClubTranslation, translation => translation.club)
  translations: ClubTranslation[];
}
