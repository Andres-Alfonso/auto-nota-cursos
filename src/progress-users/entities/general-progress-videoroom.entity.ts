import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { VideoRoom } from './videoroom.entity';

@Entity('general_pogress_video_rooms')
export class GeneralProgressVideoRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  porcen: number;

  @Column({ type: 'int', unsigned: true })
  id_videoroom: number;

  @Column({ type: 'int', unsigned: true })
  id_user: number;
  
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at : Date;

  @ManyToOne(() => VideoRoom)
  @JoinColumn({ name: 'id_videoroom' })
  videoRoom: VideoRoom;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_user' })
  user: User;
}