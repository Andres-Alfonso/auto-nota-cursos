/**
 * RESTORES · Contenidos del club y todo lo que cuelga de ellos.
 * Ver notas de diseño en club-core.entities.ts.
 */
import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

/** Catálogo global de tipos de contenido. NO se restaura, solo lookup. */
@Entity({ name: 'content_type' })
export class ContentType {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Catálogo. NO se restaura. */
@Entity({ name: 'lang_content_types' })
export class LangContentType {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'int', nullable: true }) content_type_id: number | null;
    @Column({ type: 'int', nullable: true }) lang_id: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'contents' })
export class Content {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) thumbnail: string | null;
    @Column({ type: 'int', nullable: true }) content_type_id: number | null;
    @Column({ type: 'int', nullable: true }) club_id: number | null;
    @Column({ type: 'int', nullable: true }) user_create: number | null;
    @Column({ type: 'tinyint', nullable: true }) important: number | null;
    @Column({ type: 'int', nullable: true }) number_visits: number | null;
    @Column({ type: 'int', nullable: true }) evaluation_id: number | null;
    @Column({ type: 'datetime', nullable: true }) limit_date: Date | null;
    @Column({ type: 'tinyint', nullable: true }) content_share: number | null;
    @Column({ type: 'tinyint', nullable: true }) content_private: number | null;
    @Column({ type: 'int', nullable: true }) id_task: number | null;
    @Column({ type: 'int', nullable: true }) id_polls: number | null;
    @Column({ type: 'int', nullable: true }) id_advertisements: number | null;
    @Column({ name: 'checkEmbeBBB', type: 'tinyint', nullable: true }) checkEmbeBBB: number | null;
    @Column({ name: 'urlEmbedBBB', type: 'text', nullable: true }) urlEmbedBBB: string | null;
    @Column({ type: 'int', nullable: true }) order_position: number | null;
    // No están en el fillable pero las relaciones folder()/event() y
    // Event::delete() prueban que existen. FKs a tablas con PK uuid.
    @Column({ type: 'char', length: 36, nullable: true }) folder_id: string | null;
    @Column({ type: 'char', length: 36, nullable: true }) event_id: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Traducciones de contenidos (aquí viven name/description). */
@Entity({ name: 'lang_contents' })
export class LangContent {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'int' }) content_id: number;
    @Column({ type: 'int', nullable: true }) lang_id: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Archivos físicos (imágenes, videos, docs) referenciados por contenidos. */
@Entity({ name: 'images' })
export class Images {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'bigint', nullable: true }) size: string | number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote contenido ↔ archivo. El modelo ImageContent existe → asumo id propio. */
@Entity({ name: 'content_images' })
export class ContentImage {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) content_id: number;
    @Column({ type: 'int' }) image_id: number;
    // ⚠ VERIFICAR si la tabla tiene timestamps
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'lang_images' })
export class LangImage {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'int' }) images_id: number; // ojo: FK se llama images_id
    @Column({ type: 'int', nullable: true }) lang_id: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Embeds (YouTube, Vimeo, etc.). PK uuid por UsesUuid. */
@Entity({ name: 'content_embed' })
export class ContentEmbed {
    @PrimaryColumn({ type: 'char', length: 36 }) id: string;
    @Column({ type: 'text', nullable: true }) code: string | null;
    @Column({ type: 'int' }) content_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Carpetas del club. PK uuid por UsesUuid. */
@Entity({ name: 'folders' })
export class Folder {
    @PrimaryColumn({ type: 'char', length: 36 }) id: string;
    // Club::folders() es hasMany → club_id existe aunque no esté en fillable
    @Column({ type: 'int', nullable: true }) club_id: number | null;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'int', nullable: true }) count: number | null;
    @Column({ type: 'varchar', nullable: true }) thumbnail: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Eventos de calendario del club. PK uuid por UsesUuid. */
@Entity({ name: 'events' })
export class Event {
    @PrimaryColumn({ type: 'char', length: 36 }) id: string;
    @Column({ type: 'int', nullable: true }) club_id: number | null;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'varchar', nullable: true }) url: string | null;
    @Column({ type: 'datetime', nullable: true }) start_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) end_at: Date | null;
    @Column({ type: 'tinyint', nullable: true }) all_day: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/**
 * Categorías del club. PK uuid por UsesUuid.
 * ⚠ VERIFICAR: es LocalizableModel con localizable=["name"] — confirmar si
 * además de categories.name hay tabla de traducciones (p.ej. category_translations).
 */
@Entity({ name: 'categories' })
export class Category {
    @PrimaryColumn({ type: 'char', length: 36 }) id: string;
    @Column({ type: 'int', nullable: true }) club_id: number | null;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'varchar', nullable: true }) picture: string | null;
    @Column({ type: 'int', nullable: true }) count: number | null;
    @Column({ type: 'int', nullable: true }) index: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote contenido ↔ categoría (category_id es uuid). */
@Entity({ name: 'content_category' })
export class ContentCategory {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) content_id: number;
    @Column({ type: 'char', length: 36 }) category_id: string;
    // ⚠ VERIFICAR si la tabla tiene timestamps
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote comentario ↔ contenido (withTimestamps). ⚠ VERIFICAR forma exacta. */
@Entity({ name: 'comment_content' })
export class CommentContent {
    @PrimaryColumn({ type: 'int' }) comment_id: number;
    @PrimaryColumn({ type: 'int' }) content_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Visitas por usuario a cada contenido (métrica de progreso). */
@Entity({ name: 'user_visit_contents' })
export class UserVisitContents {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'int' }) content_id: number;
    @Column({ type: 'int', nullable: true }) number_visits: number | null;
    @Column({ type: 'text', nullable: true }) updates_at: string | null; // JSON crudo
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Paquetes SCORM asociados a contenidos. */
@Entity({ name: 'scorms' })
export class Scorm {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) id_user: number | null;
    @Column({ type: 'int', nullable: true }) id_content: number | null;
    @Column({ type: 'varchar', nullable: true }) uuid: string | null;
    @Column({ type: 'varchar', nullable: true }) folder: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}