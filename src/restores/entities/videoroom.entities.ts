/**
 * RESTORES · Videorooms (módulos del curso) y sus tablas detalle.
 * Ver notas de diseño en club-core.entities.ts.
 */
import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

@Entity({ name: 'videorooms' })
export class VideoRoom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'varchar', nullable: true }) thumbnail: string | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_create: number | null;
    @Column({ type: 'int', nullable: true }) evaluation_id: number | null;
    @Column({ type: 'int', nullable: true }) content_id: number | null;
    @Column({ type: 'int', nullable: true }) id_polls: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_modules: number | null;
    @Column({ type: 'int', nullable: true }) number_module: number | null;
    @Column({ type: 'varchar', nullable: true }) banner_img: string | null;
    @Column({ type: 'tinyint', nullable: true }) check_banner: number | null;
    @Column({ type: 'int', nullable: true }) porcent_modules: number | null;
    @Column({ type: 'tinyint', nullable: true }) check_porcent_videoroom_evaluation: number | null;
    @Column({ type: 'int', nullable: true }) id_advertisements: number | null;
    @Column({ type: 'int', nullable: true }) id_task: number | null;
    @Column({ type: 'varchar', nullable: true }) color: string | null;
    // SoftDeletes: copiar tal cual, incluidos videorooms ya borrados legítimamente
    @Column({ type: 'datetime', nullable: true }) deleted_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/**
 * ⚠ PROVISIONAL — pásame el modelo App\VideoRoomContent para confirmar.
 * Inferido de VideoRoom::all_contents(): pivote videoroom_content con
 * columna 'order'. PK compuesta a propósito: funciona aunque la tabla
 * tenga id autoincrement (MySQL lo genera en el insert).
 */
@Entity({ name: 'videoroom_content' })
export class VideoRoomContent {
    @PrimaryColumn({ type: 'int' }) videoroom_id: number;
    @PrimaryColumn({ type: 'int' }) content_id: number;
    @Column({ type: 'int', nullable: true }) order: number | null;
}

@Entity({ name: 'detail_evaluation_video_rooms' })
export class DetailEvaluationVideoRoom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) position: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) id_evaluation: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/**
 * Actividades/juegos en videorooms. La tabla de las actividades en sí
 * (id_activities → ¿activities?) falta — ver lista de pendientes.
 */
@Entity({ name: 'detail_video_room_activitaties' })
export class DetailVideoRoomActivitaties {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) id_activities: number;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'detail_tasks_videorooms' })
export class DetailTasksVideoroom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) videorooms_id: number;
    @Column({ type: 'int' }) tasks_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'detail_walls_video_rooms' })
export class DetailWallsVideoRoom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) videorooms_id: number;
    @Column({ type: 'int' }) advertisements_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'detail_users_private_videorroms' })
export class DetailUsersPrivateVideorrom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) videoroom_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Autoevaluaciones del club. */
@Entity({ name: 'selft_evaluations' })
export class SelftEvaluation {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'int', nullable: true }) time: number | null;
    @Column({ type: 'tinyint', nullable: true }) share_clubs: number | null;
    @Column({ type: 'varchar', nullable: true }) miniature: string | null;
    @Column({ type: 'int', nullable: true }) club_id: number | null;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'questions_selft_evaluations' })
export class QuestionsSelftEvaluation {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) text: string | null;
    @Column({ type: 'int', nullable: true }) order: number | null;
    @Column({ type: 'int' }) selft_evaluations_id: number;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'options_self_evaluations' })
export class OptionsSelfEvaluation {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) text: string | null;
    @Column({ type: 'int', nullable: true }) points: number | null;
    @Column({ type: 'int' }) questions_selft_evaluations_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'detail_selft_evaluation_videorooms' })
export class DetailSelftEvaluationVideoroom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) position: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) selft_evaluations_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}