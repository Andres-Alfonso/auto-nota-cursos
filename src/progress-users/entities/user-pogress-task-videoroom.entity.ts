import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('user_pogress_task_videorooms')
export class UserProgressTaskVideoRoom{
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    porcen: number;

    @Column({type: 'int', unsigned: true})
    id_videoroom: number;

    @Column({type: 'int', unsigned: true})
    id_user: number;

    @Column({type: 'int', unsigned: true})
    id_task: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at : Date;
}
