import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('detail_video_room_activitaties')
export class DetailActivitiesVideoRoom{
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column({type: 'int', unsigned: true})
    id_videoroom: number;

    @Column({type: 'int', unsigned: true})
    id_activities: number;

    @Column()
    type: string;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at : Date;
}
