import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Club } from './club.entity';

@Entity('club_user')
export class ClubUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  club_id: number;

  @Column({ type: 'int', unsigned: true })
  user_id: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => Club, club => club.clubUsers)
  @JoinColumn({ name: 'club_id' })
  club: Club;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}