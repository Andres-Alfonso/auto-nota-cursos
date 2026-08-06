/**
 * RESTORES · Progreso de usuarios en videorooms + traducciones de club.
 * Ver notas de diseño en club-core.entities.ts.
 *
 * Todos los modelos Laravel de este archivo usan `protected $guarded = ['id']`
 * (a veces con el typo `$filable` en vez de `$fillable`, que Laravel ignora
 * silenciosamente). guarded=['id'] significa que TODAS las demás columnas —
 * incluidos created_at/updated_at si el modelo no desactiva $timestamps —
 * son asignables. Se listan aquí como nullable porque no hay certeza de que
 * existan; si el modelo tiene `public $timestamps = false` sobran y no
 * pasan el filtro de columnas del CopyEngine (se ignoran solas).
 */
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** Progreso general del videoroom completo (barra de avance del módulo). */
@Entity({ name: 'general_pogress_video_rooms' })
export class GeneralPogressVideoRoom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcen: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) id_user: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Progreso por contenido dentro de un videoroom. */
@Entity({ name: 'user_pogress_video_rooms' })
export class UserPogressVideoRoom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcen: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) id_user: number;
    @Column({ type: 'int', nullable: true }) id_content: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Progreso de una tarea dentro de un videoroom. */
@Entity({ name: 'user_pogress_task_videorooms' })
export class UserPogressTaskVideoroom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcen: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) id_user: number;
    @Column({ type: 'int', nullable: true }) id_task: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Progreso de un muro/foro dentro de un videoroom. */
@Entity({ name: 'user_pogress_forum_videorooms' })
export class UserPogressForumVideoroom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcen: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) id_user: number;
    @Column({ type: 'int', nullable: true }) id_advertisements: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/**
 * Progreso de una actividad/juego dentro de un videoroom.
 * `type` identifica a qué tabla de juego pertenece id_activity
 * (alphabet_soups, crosswords, drag_drops, hanging_games, memory_games,
 * time_sequences, complete_sentences) — ⚠ VERIFICAR los valores exactos
 * que usa `type` (ver GAME_TYPE_MAP en el service).
 */
@Entity({ name: 'user_pogress_video_room_activities' })
export class UserPogressVideoRoomActivity {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcen: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) id_user: number;
    @Column({ type: 'int' }) id_activity: number;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Progreso de una evaluación dentro de un videoroom. */
@Entity({ name: 'user_pogress_evaluation_video_rooms' })
export class UserPogressEvaluationVideoRoom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcen: number | null;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'int' }) id_user: number;
    @Column({ type: 'int', nullable: true }) id_evaluation: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Progreso de una autoevaluación dentro de un videoroom. */
@Entity({ name: 'user_pogress_selft_evaluation_videorroms' })
export class UserPogressSelftEvaluationVideorrom {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcen: number | null;
    @Column({ type: 'int' }) selft_evaluations_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'int' }) id_videoroom: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Progreso de SCORM (avance de secciones del paquete). */
@Entity({ name: 'pogress_scorm_users' })
export class PogressScormUser {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) porcent: number | null;
    @Column({ type: 'int' }) id_user: number;
    @Column({ type: 'int' }) id_scorm: number;
    @Column({ type: 'int', nullable: true }) current_section: number | null;
    @Column({ type: 'int', nullable: true }) total_sections: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Traducciones del club (título por idioma). */
@Entity({ name: 'club_translations' })
export class ClubTranslation {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'varchar', nullable: true }) locale: string | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}