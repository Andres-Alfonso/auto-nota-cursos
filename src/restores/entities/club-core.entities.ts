/**
 * ══════════════════════════════════════════════════════════════════════
 *  RESTORES · Entidades núcleo del Club
 * ══════════════════════════════════════════════════════════════════════
 * Decisiones de diseño (aplican a TODOS los archivos de /restores/entities):
 *
 * 1. SIN relaciones TypeORM (@ManyToOne, etc.). El grafo se recorre
 *    manualmente en el RestoresService con queries por FK, en orden
 *    topológico controlado. Para un restore, los cascades automáticos
 *    son un riesgo, no una ayuda.
 *
 * 2. created_at / updated_at / deleted_at son @Column normales.
 *    NUNCA usar @CreateDateColumn / @UpdateDateColumn / @DeleteDateColumn:
 *    - los Date columns auto-gestionados sobreescribirían las fechas
 *      originales al insertar en producción;
 *    - @DeleteDateColumn haría que find() EXCLUYA filas soft-deleted del
 *      backup (ej. videorooms con deleted_at legítimo que hay que copiar
 *      tal cual).
 *
 * 3. Flags booleanos → type 'tinyint' (number). Copia 0/1 literal, sin
 *    transformación a boolean.
 *
 * 4. Columnas JSON (metadata, conference_users, etc.) → type 'text'.
 *    Se copia el string crudo sin parsear. Si la columna real es de tipo
 *    JSON nativo de MySQL, cambiar a type: 'json'.
 *
 * 5. synchronize:false → los tipos aquí solo afectan el mapeo de valores,
 *    nunca el esquema. Los DECIMAL pueden llegar como string por el driver
 *    mysql2; se re-insertan igual sin problema.
 *
 * 6. Las columnas marcadas con ⚠ VERIFICAR salen de inferencias (relaciones
 *    Eloquent, $attributes) y no del fillable. Antes del primer run real,
 *    comparar contra SHOW COLUMNS / INFORMATION_SCHEMA.
 *
 * 7. Pivotes cuya forma exacta no conozco usan PK compuesta por las dos FK.
 *    Es seguro aunque la tabla tenga un id autoincrement: el SELECT funciona
 *    y el INSERT deja que MySQL genere el id (el id del pivote no importa).
 */
import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

@Entity({ name: 'clubs' })
export class Club {
    @PrimaryGeneratedColumn() id: number;

    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'tinyint', nullable: true }) public: number | null;
    @Column({ type: 'int', nullable: true }) client_id: number | null;
    @Column({ type: 'int', nullable: true }) creator_user: number | null;
    @Column({ type: 'varchar', nullable: true }) imagen: string | null;
    @Column({ type: 'varchar', nullable: true }) conference: string | null;
    @Column({ type: 'varchar', nullable: true }) conference_tab: string | null;
    @Column({ type: 'varchar', nullable: true }) conference_tab_en: string | null;
    @Column({ type: 'varchar', nullable: true }) conference_tab_icon: string | null;
    @Column({ type: 'varchar', nullable: true }) conference_type: string | null;
    @Column({ type: 'int', nullable: true }) conference_user: number | null;
    @Column({ type: 'text', nullable: true }) metadata: string | null; // JSON crudo
    @Column({ type: 'text', nullable: true }) conference_users: string | null; // JSON crudo
    @Column({ type: 'varchar', nullable: true }) content_view: string | null;
    @Column({ type: 'varchar', nullable: true }) conference_background: string | null;
    @Column({ type: 'tinyint', nullable: true }) es_content: number | null;
    @Column({ type: 'tinyint', nullable: true }) en_content: number | null;
    @Column({ type: 'tinyint', nullable: true }) es_test: number | null;
    @Column({ type: 'tinyint', nullable: true }) en_test: number | null;
    @Column({ type: 'varchar', nullable: true }) cover_video: string | null;
    @Column({ type: 'varchar', nullable: true }) cover_image: string | null;
    @Column({ type: 'tinyint', nullable: true }) es_forum: number | null;
    @Column({ type: 'tinyint', nullable: true }) en_forum: number | null;
    @Column({ type: 'tinyint', nullable: true }) es_task: number | null;
    @Column({ type: 'tinyint', nullable: true }) en_task: number | null;
    @Column({ type: 'tinyint', nullable: true }) es_poll: number | null;
    @Column({ type: 'tinyint', nullable: true }) en_poll: number | null;
    // ⚠ VERIFICAR: el fillable dice 'crips_code' pero $attributes dice 'crisp_code'.
    // Probablemente solo UNA de las dos existe en la tabla. Dejar la real y borrar la otra.
    @Column({ type: 'varchar', nullable: true }) crips_code: string | null;
    @Column({ type: 'int', nullable: true }) index: number | null;
    @Column({ type: 'varchar', nullable: true }) storage_path_name: string | null;
    @Column({ type: 'tinyint', nullable: true }) activatebaground: number | null;
    @Column({ type: 'tinyint', nullable: true }) es_videoroom: number | null;
    @Column({ type: 'tinyint', nullable: true }) en_videoroom: number | null;
    @Column({ type: 'tinyint', nullable: true }) es_directchat: number | null;
    @Column({ type: 'tinyint', nullable: true }) en_directchat: number | null;
    @Column({ type: 'int', nullable: true }) id_secction: number | null;
    @Column({ type: 'varchar', nullable: true }) password: string | null;
    @Column({ type: 'int', nullable: true }) ordergroup: number | null;
    @Column({ type: 'varchar', nullable: true }) group: string | null;
    @Column({ type: 'varchar', nullable: true }) color_tilte: string | null;
    @Column({ type: 'tinyint', nullable: true }) notification_whatsapp: number | null;
    @Column({ name: 'es_Activity', type: 'tinyint', nullable: true }) es_Activity: number | null;
    @Column({ name: 'en_Activity', type: 'tinyint', nullable: true }) en_Activity: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_cover_header: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_cover_footer: number | null;
    @Column({ type: 'varchar', nullable: true }) video_cover_video_room: string | null;
    @Column({ type: 'text', nullable: true }) description_video_cover_videoroom: string | null;
    @Column({ type: 'varchar', nullable: true }) title_video_cover_video_room: string | null;
    @Column({ type: 'varchar', nullable: true }) video_cover_videoroom_footer: string | null;
    @Column({ type: 'text', nullable: true }) description_video_cover_videoroom_footer: string | null;
    @Column({ type: 'varchar', nullable: true }) title_video_cover_videoroom_footer: string | null;
    @Column({ type: 'varchar', nullable: true }) default_tabl: string | null;
    @Column({ type: 'varchar', nullable: true }) inten_hour: string | null;
    @Column({ type: 'varchar', nullable: true }) abbreviation: string | null;
    @Column({ type: 'tinyint', nullable: true }) check_multiple_sections: number | null;
    @Column({ type: 'tinyint', nullable: true }) not_visible: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_welcome_message: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_access_without_order_modules: number | null;
    @Column({ type: 'tinyint', nullable: true }) elective_club: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_show_attempts_evaluations_in_videorooms: number | null;

    @Column({ type: 'datetime', nullable: true }) deleted_at: Date | null; // SoftDeletes
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote alumno ↔ club (con timestamps por withTimestamps()). */
@Entity({ name: 'club_user' })
export class ClubUser {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Hosts / profesores del club. */
@Entity({ name: 'hosts_club_detailems' })
export class HostsClubDetailem {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Permisos asignados al club. La tabla 'permissions' en sí es catálogo (no se restaura). */
@Entity({ name: 'club_permission' })
export class PermissionClub {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) permission_id: number;
    @Column({ type: 'int' }) club_id: number;
    // ⚠ VERIFICAR si la tabla tiene timestamps
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote de viewers (Club::viewers → belongsToMany 'club_viewer'). ⚠ VERIFICAR forma exacta. */
@Entity({ name: 'club_viewer' })
export class ClubViewer {
    @PrimaryColumn({ type: 'int' }) club_id: number;
    @PrimaryColumn({ type: 'int' }) user_id: number;
}

/** Secciones (catálogo por cliente). Solo se restaura si la sección también fue borrada. */
@Entity({ name: 'secction_clubs' })
export class SecctionClubs {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'varchar', nullable: true }) imagen: string | null;
    @Column({ type: 'int', nullable: true }) client_id: number | null;
    @Column({ type: 'int', nullable: true }) creator_user: number | null;
    @Column({ type: 'int', nullable: true }) orden: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_certificate: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_banner: number | null;
    @Column({ type: 'varchar', nullable: true }) link_banner: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'detail_section_clubs' })
export class DetailSectionClub {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int' }) section_id: number;
    @Column({ type: 'int', nullable: true }) order: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'detail_user_sections_clubs' })
export class DetailUserSectionsClub {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int' }) section_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Catálogo de filtros por CLIENTE. Normalmente NO se restaura, solo se referencia. */
@Entity({ name: 'clubs_filters' })
export class ClubFilter {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) client_id: number | null;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'tinyint', nullable: true }) status_filter: number | null;
    @Column({ type: 'text', nullable: true }) values: string | null; // JSON crudo
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Valores de filtro asignados a ESTE club → sí se restauran. */
@Entity({ name: 'club_filter_values' })
export class ClubFilterValue {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int' }) filter_id: number;
    @Column({ type: 'varchar', nullable: true }) value: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Certificados de recursos emitidos a usuarios. */
@Entity({ name: 'user_certificates_resources' })
export class UserCertificate {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    // ⚠ VERIFICAR: Club::userCertificates() es hasMany → implica columna club_id
    // aunque no está en el fillable del modelo.
    @Column({ type: 'int', nullable: true }) club_id: number | null;
    @Column({ type: 'varchar', nullable: true }) file_path: string | null;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'date', nullable: true }) issue_date: Date | string | null;
    @Column({ type: 'date', nullable: true }) expiry_date: Date | string | null;
    @Column({ type: 'text', nullable: true }) user_snapshot: string | null; // JSON crudo
    @Column({ type: 'text', nullable: true }) metadata: string | null; // JSON crudo
    @Column({ type: 'text', nullable: true }) additional_info: string | null;
    @Column({ type: 'int', nullable: true }) client_id: number | null;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'varchar', nullable: true }) title_document_requirement: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/**
 * Pivote hilos de chat ↔ club (paquete Messenger).
 * Restaurar SOLO el pivote deja hilos huérfanos si los threads/messages
 * también fueron borrados; ver lista de pendientes.
 */
@Entity({ name: 'thread_club' })
export class ThreadClub {
    @PrimaryColumn({ type: 'int' }) thread_id: number;
    @PrimaryColumn({ type: 'int' }) club_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/**
 * ⚠ VERIFICAR NOMBRE DE TABLA: Club::progressReports() usa
 * 'progress_report_clubs' pero ProgressReport::clubs() usa
 * 'progress_reports_clubs'. Solo una existe — correr:
 *   SHOW TABLES LIKE 'progress_report%';
 * Los ProgressReport en sí pertenecen a usuarios y probablemente
 * siguen en producción; solo se restaura el pivote.
 */
@Entity({ name: 'progress_report_clubs' })
export class ProgressReportClub {
    @PrimaryColumn({ type: 'int' }) progress_report_id: number;
    @PrimaryColumn({ type: 'int' }) club_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}