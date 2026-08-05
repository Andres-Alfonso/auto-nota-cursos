/**
 * RESTORES · Muros (advertisements), tareas, tabs y comentarios.
 * Ver notas de diseño en club-core.entities.ts.
 */
import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

/** Muros / anuncios del club. */
@Entity({ name: 'advertisements' })
export class Advertisenment {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_create: number | null;
    @Column({ type: 'varchar', nullable: true }) image: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'lang_advertisenments' })
export class LangAdvertisenments {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) advertisement: string | null;
    @Column({ type: 'int' }) advertisenment_id: number; // ojo al nombre de la FK
    @Column({ type: 'int', nullable: true }) lang_id: number | null;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'datetime', nullable: true }) expiration_date: Date | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Tareas del club. */
@Entity({ name: 'tasks' })
export class Task {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_create: number | null;
    @Column({ type: 'tinyint', nullable: true }) files: number | null;
    @Column({ type: 'varchar', nullable: true }) image: string | null;
    @Column({ type: 'tinyint', nullable: true }) selft_qualified: number | null;
    @Column({ type: 'int', nullable: true }) max_files: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Traducciones de tareas (tabla singular: lang_task). */
@Entity({ name: 'lang_task' })
export class LangTask {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) task: string | null;
    @Column({ type: 'int' }) task_id: number;
    @Column({ type: 'int', nullable: true }) lang_id: number | null;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'datetime', nullable: true }) expiration_date: Date | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Entregas de los usuarios (archivos + calificación). */
@Entity({ name: 'attachment_tasks' })
export class AttachmentTask {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) task_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'float', nullable: true }) calification: number | null;
    @Column({ type: 'text', nullable: true }) comment: string | null;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'float', nullable: true }) final_calification: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Tabs personalizados del club. */
@Entity({ name: 'tabs' })
export class Tab {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_create: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'lang_tabs' })
export class LangTabs {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) tabs_id: number;
    @Column({ type: 'int', nullable: true }) lang_id: number | null;
    @Column({ type: 'text', nullable: true }) content: string | null;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Comentarios (tabla global; se enlazan al club vía pivotes). */
@Entity({ name: 'comments' })
export class Comment {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'tinyint', nullable: true }) approved: number | null;
    @Column({ type: 'int', nullable: true }) lang_id: number | null;
    @Column({ type: 'text', nullable: true }) comment: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Respuestas a comentarios (con auto-referencia answer_comment_id). */
@Entity({ name: 'answer_comments' })
export class AnswerComment {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) comment_id: number | null;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'text', nullable: true }) text: string | null;
    @Column({ type: 'int', nullable: true }) answer_comment_id: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'reactions_comments' })
export class ReactionsComments {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) comment_id: number | null;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'varchar', nullable: true }) reaction: string | null;
    @Column({ type: 'int', nullable: true }) answer_comment_id: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote comentario ↔ muro. Tiene modelo propio → asumo id. */
@Entity({ name: 'comment_advertisement' })
export class CommentAdvertisement {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) comment_id: number;
    @Column({ type: 'int' }) advertisenment_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote comentario ↔ tarea (withTimestamps). ⚠ VERIFICAR forma exacta. */
@Entity({ name: 'comment_task' })
export class CommentTask {
    @PrimaryColumn({ type: 'int' }) comment_id: number;
    @PrimaryColumn({ type: 'int' }) task_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}