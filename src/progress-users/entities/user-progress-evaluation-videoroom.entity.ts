import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('user_pogress_evaluation_video_rooms')
export class UserProgressEvaluationVideoRoom{
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    porcen: number;

    @Column({type: 'int', unsigned: true})
    id_videoroom: number;

    @Column({type: 'int', unsigned: true})
    id_user: number;

    @Column({type: 'int', unsigned: true})
    id_evaluation: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at : Date;
}
