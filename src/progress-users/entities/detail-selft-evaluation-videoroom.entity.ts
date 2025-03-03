import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('detail_selft_evaluation_videorooms')
export class DetailSelftEvaluationVideoRoom{
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    position: number;

    @Column({type: 'int', unsigned: true})
    id_videoroom: number;

    @Column({type: 'int', unsigned: true})
    selft_evaluations_id: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at : Date;
}
