import { Column } from "typeorm";

export class ProgressUser {
    
    @Column({ primary: true, generated: true })
    id: number;

    @Column()
    porcen: number;

    @Column()
    id_videoroom: number;
    
    @Column()
    id_user: number;

    @Column()
    created_at: Date;

    @Column()
    updated_at: Date;
}
