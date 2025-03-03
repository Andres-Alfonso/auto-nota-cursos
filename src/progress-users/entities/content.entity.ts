import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, PrimaryColumn } from "typeorm";

@Entity('Contents')
export class Content {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    thumbnail: String;

    @Column({type: 'int', unsigned: true})
    club_id: number;
}