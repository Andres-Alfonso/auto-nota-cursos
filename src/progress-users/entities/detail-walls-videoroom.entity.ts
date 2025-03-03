import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('detail_walls_video_rooms')
export class DetailWallsVideoRoom{
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column({type: 'int', unsigned: true})
    videorooms_id: number;

    @Column({type: 'int', unsigned: true})
    advertisements_id: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at : Date;
}
