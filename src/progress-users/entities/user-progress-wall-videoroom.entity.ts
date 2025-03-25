import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { VideoRoom } from "./videoroom.entity";
import { User } from "./user.entity";
import { Content } from "./content.entity";

@Entity('user_pogress_forum_videorooms')
export class UserProgressForumVideoRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    porcen: number;

    @Column({type: 'int', unsigned: true})
    id_videoroom: number;

    @Column({type: 'int', unsigned: true})
    id_user: number;

    @Column({type: 'int', unsigned: true})
    id_advertisements: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: string;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at : string;
}