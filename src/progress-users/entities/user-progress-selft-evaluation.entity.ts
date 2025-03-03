import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('user_pogress_selft_evaluation_videorroms')
export class UserProgressSelftEvaluationVideoRoom{
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    porcen: number;

    @Column({type: 'int', unsigned: true})
    id_videoroom: number;

    @Column({type: 'int', unsigned: true})
    user_id: number;

    @Column({type: 'int', unsigned: true})
    selft_evaluations_id: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at : Date;
}