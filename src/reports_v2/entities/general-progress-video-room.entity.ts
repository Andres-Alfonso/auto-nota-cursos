import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('general_pogress_video_rooms')
export class GeneralProgressVideoRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_user' })
  id_user: number;

  @Column({ name: 'id_videoroom' })
  id_videoroom: number;

  @Column()
  porcen: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at: Date;
}