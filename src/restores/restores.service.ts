/**
 * ══════════════════════════════════════════════════════════════════════
 *  RestoresService — Restaura un club desde un backup MySQL a producción
 * ══════════════════════════════════════════════════════════════════════
 *
 * MOTOR DE COPIA (insertSmart):
 *  1. El id del backup NO existe en producción → se inserta con su id
 *     original (los hijos no necesitan remapeo).
 *  2. El id SÍ existe y la fila "se ve igual" (mismo created_at/updated_at)
 *     → es el MISMO registro que sobrevivió en prod (evaluación compartida,
 *     contenido compartido, comment vivo...) → se REUTILIZA, no se duplica.
 *  3. El id SÍ existe pero es OTRA fila (autoincrement reutilizado tras el
 *     borrado) → se inserta SIN id, MySQL genera uno nuevo, y el par
 *     old→new queda en el idMap. Todas las FKs del subárbol se reescriben
 *     con ese mapa. (= política "crear nuevo registro")
 *
 * OTRAS REGLAS:
 *  - TODO corre dentro de UNA transacción sobre producción. dryRun=true
 *    ejecuta idéntico y hace ROLLBACK al final → el reporte de un dry-run
 *    es exactamente lo que haría el run real.
 *  - Lectura del backup con SELECT * → trabajamos con las columnas REALES,
 *    no con los fillable de Laravel. Antes de insertar, cada fila se filtra
 *    contra INFORMATION_SCHEMA de producción: columnas que el backup tiene
 *    y prod no, se descartan y se reportan (a la inversa quedan en default).
 *  - Filas que pertenecen a un usuario que ya no existe en producción se
 *    SALTAN y se reportan (club_user, answers, entregas...). Columnas
 *    "autor" opcionales (creator_user, user_create) se ponen en NULL.
 *  - Tablas con PK uuid (folders, events, categories, certificates,
 *    content_embed): el uuid no colisiona por accidente → si ya existe,
 *    es la misma fila → reuse.
 *  - Catálogos que NUNCA se copian, solo se referencian: users, clients,
 *    langs, roles, permissions, content_type, clubs_filters.
 *  - secction_clubs es catálogo por cliente: solo se copia si la sección
 *    referenciada no existe en producción.
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RestoreClubDto } from './dto/restore-club.dto';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type NumMap = Map<number, number>;

interface IdMap {
    clubs: NumMap;
    sections: NumMap;
    videorooms: NumMap;
    contents: NumMap;
    scorms: NumMap;
    evaluations: NumMap;
    questions: NumMap;
    options: NumMap;
    additionalQuestions: NumMap;
    additionalQuestionOptions: NumMap;
    images: NumMap;
    advertisements: NumMap;
    tasks: NumMap;
    tabs: NumMap;
    comments: NumMap;
    answerComments: NumMap;
    selftEvaluations: NumMap;
    questionsSelft: NumMap;
    // Mini-juegos (referenciados por detail_video_room_activitaties.id_activities
    // y por user_pogress_video_room_activities.id_activity, según el campo `type`)
    games: {
        alphabetSoup: NumMap;
        completeSentences: NumMap;
        crossword: NumMap;
        dragDrop: NumMap;
        hangingGame: NumMap;
        memoryGame: NumMap;
        timeSequence: NumMap;
    };
}

/**
 * ⚠ VERIFICAR: valores reales que guarda la columna `type` en
 * detail_video_room_activitaties y user_pogress_video_room_activities.
 * Estos son los nombres más probables dados los nombres de tabla/clase;
 * confírmalos con `SELECT DISTINCT type FROM detail_video_room_activitaties`
 * y ajusta las claves de este mapa si no coinciden.
 */
const GAME_TYPE_MAP: Record<string, keyof IdMap['games']> = {
    alphabet_soup: 'alphabetSoup',
    alphabet_soups: 'alphabetSoup',
    complete_sentences: 'completeSentences',
    crossword: 'crossword',
    crosswords: 'crossword',
    drag_drop: 'dragDrop',
    drag_drops: 'dragDrop',
    hanging_game: 'hangingGame',
    hanging_games: 'hangingGame',
    memory_game: 'memoryGame',
    memory_games: 'memoryGame',
    time_sequence: 'timeSequence',
    time_sequences: 'timeSequence',
};

export interface RestoreReport {
    dryRun: boolean;
    clubId: number;
    /** id del club en producción tras el restore (≠ clubId si hubo colisión). */
    newClubId: number | null;
    /** Estado previo del id original en producción. */
    prodClubState: 'no-existe' | 'existe-activo' | 'existe-soft-deleted';
    inserted: Record<string, number>;   // filas nuevas con su id original
    remapped: Record<string, number>;   // filas nuevas con id NUEVO (colisión)
    reused: Record<string, number>;     // filas que ya vivían en prod (compartidas)
    skipped: string[];                  // filas saltadas (usuario inexistente, etc.)
    warnings: string[];
    droppedColumns: Record<string, string[]>; // tabla → columnas del backup que prod no tiene
    errors: string[];
    startedAt: string;
    finishedAt: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RestoresService {
    private readonly logger = new Logger(RestoresService.name);

    constructor(
        @InjectDataSource() private readonly prodDs: DataSource,
        private readonly config: ConfigService,
    ) { }

    // ── Conexión dinámica al backup ───────────────────────────────────────────

    private async buildBackupDataSource(dto: RestoreClubDto): Promise<DataSource> {
        const ds = new DataSource({
            type: 'mysql',
            host: dto.backupHost ?? this.config.get('BACKUP_DB_HOST', '127.0.0.1'),
            port: dto.backupPort ?? +this.config.get('BACKUP_DB_PORT', '3306'),
            username: dto.backupUser ?? this.config.get('BACKUP_DB_USER', 'root'),
            password: dto.backupPassword ?? this.config.get('BACKUP_DB_PASSWORD', ''),
            database: dto.backupDatabase ?? this.config.get('BACKUP_DB_NAME', 'lms_backup'),
            synchronize: false,
            // Fechas como string 'YYYY-MM-DD HH:mm:ss' → se re-insertan idénticas,
            // sin corrimientos de timezone del driver.
            extra: { dateStrings: true },
        });
        await ds.initialize();
        return ds;
    }

    // ── Chequeo previo (GET-like, no escribe nada) ────────────────────────────

    async checkClub(dto: RestoreClubDto) {
        const backup = await this.buildBackupDataSource(dto);
        try {
            const [club] = await backup.query('SELECT * FROM `clubs` WHERE id = ? LIMIT 1', [dto.clubId]);
            if (!club) throw new NotFoundException(`Club ${dto.clubId} no encontrado en el backup`);

            const [prodClub] = await this.prodDs.query(
                'SELECT id, name, deleted_at, created_at FROM `clubs` WHERE id = ? LIMIT 1',
                [dto.clubId],
            );

            const countIn = async (sql: string) =>
                Number((await backup.query(sql, [dto.clubId]))[0]?.n ?? 0);

            return {
                backup: {
                    id: club.id,
                    name: club.name,
                    client_id: club.client_id,
                    deleted_at: club.deleted_at,
                    contenidos: await countIn('SELECT COUNT(*) n FROM `contents` WHERE club_id = ?'),
                    videorooms: await countIn('SELECT COUNT(*) n FROM `videorooms` WHERE club_id = ?'),
                    alumnos: await countIn('SELECT COUNT(*) n FROM `club_user` WHERE club_id = ?'),
                    evaluaciones: await countIn('SELECT COUNT(*) n FROM `evaluation_clubs` WHERE club_id = ?'),
                    tareas: await countIn('SELECT COUNT(*) n FROM `tasks` WHERE club_id = ?'),
                    muros: await countIn('SELECT COUNT(*) n FROM `advertisements` WHERE club_id = ?'),
                },
                produccion: prodClub
                    ? {
                        // ¡OJO! Si está solo soft-deleted quizá baste con UPDATE deleted_at=NULL
                        // y verificar los hijos, en vez de un restore completo.
                        estado: prodClub.deleted_at ? 'existe-soft-deleted' : 'existe-activo',
                        fila: prodClub,
                    }
                    : { estado: 'no-existe' },
            };
        } finally {
            await backup.destroy();
        }
    }

    // ── Entry-point principal ─────────────────────────────────────────────────

    async restoreClub(dto: RestoreClubDto): Promise<RestoreReport> {
        const dryRun = dto.dryRun !== false; // default SIEMPRE dry-run
        if (!dryRun && dto.confirm !== true) {
            throw new BadRequestException(
                'Run real requiere { dryRun: false, confirm: true }. Ejecuta primero el dry-run.',
            );
        }

        const report: RestoreReport = {
            dryRun,
            clubId: dto.clubId,
            newClubId: null,
            prodClubState: 'no-existe',
            inserted: {},
            remapped: {},
            reused: {},
            skipped: [],
            warnings: [],
            droppedColumns: {},
            errors: [],
            startedAt: new Date().toISOString(),
            finishedAt: null,
        };

        this.logger.log(`[club ${dto.clubId}] ${dryRun ? 'DRY-RUN' : 'RUN REAL'} — conectando al backup...`);
        const backup = await this.buildBackupDataSource(dto);
        const qr = this.prodDs.createQueryRunner();
        await qr.connect();

        const engine = new CopyEngine(qr, backup, report, this.logger, dto.clubId);
        const idMap = this.emptyIdMap();

        try {
            // Raíz en backup
            const [club] = await backup.query('SELECT * FROM `clubs` WHERE id = ? LIMIT 1', [dto.clubId]);
            if (!club) throw new NotFoundException(`Club ${dto.clubId} no encontrado en el backup`);
            this.logger.log(`[club ${dto.clubId}] "${club.name}" encontrado en el backup — iniciando copia (12 fases)...`);

            // Estado previo en producción
            const [prodClub] = await qr.query(
                'SELECT id, deleted_at FROM `clubs` WHERE id = ? LIMIT 1',
                [dto.clubId],
            );
            report.prodClubState = !prodClub
                ? 'no-existe'
                : prodClub.deleted_at
                    ? 'existe-soft-deleted'
                    : 'existe-activo';
            if (report.prodClubState === 'existe-soft-deleted') {
                report.warnings.push(
                    `El club ${dto.clubId} existe SOFT-DELETED en producción: considera restaurar con ` +
                    `UPDATE clubs SET deleted_at = NULL y verificar hijos antes de copiar todo (crearía un club NUEVO).`,
                );
            }

            await qr.startTransaction();
            if (dto.disableFkChecks) await qr.query('SET FOREIGN_KEY_CHECKS = 0');

            // ─── Orden topológico (con progreso por fase, log en consola) ─────────
            const phases: Array<[string, () => Promise<void>]> = [
                ['Club raíz + traducciones', () => this.restoreClubCore(engine, club, idMap)],
                ['Secciones', () => this.restoreSections(engine, club, idMap)],
                ['Miembros / hosts / permisos', () => this.restoreMembers(engine, dto.clubId, idMap)],
                ['Muros / tareas / tabs', () => this.restoreSocial(engine, dto.clubId, idMap)],
                ['Mini-juegos', () => this.restoreGames(engine, dto.clubId, idMap)],
                ['Evaluaciones', () => this.restoreEvaluations(engine, dto.clubId, idMap)],
                ['Contenidos', () => this.restoreContents(engine, dto.clubId, idMap)],
                ['Videorooms', () => this.restoreVideorooms(engine, dto.clubId, idMap)],
                ['Progreso de videorooms', () => this.restoreVideoroomProgress(engine, idMap)],
                ['Intentos de juegos', () => this.restoreGameAttempts(engine, idMap)],
                ['Datos de usuario (respuestas, comments...)', () => this.restoreUserData(engine, dto.clubId, idMap)],
                ['Pivotes finales', () => this.restoreFinalPivots(engine, dto.clubId, idMap)],
            ];

            const total = phases.length;
            for (let i = 0; i < total; i++) {
                const [name, fn] = phases[i];
                const pct = Math.round((i / total) * 100);
                this.logger.log(`[club ${dto.clubId}] (${pct}%) ${i + 1}/${total} → ${name}...`);
                const t0 = Date.now();
                await fn();
                const secs = ((Date.now() - t0) / 1000).toFixed(1);
                const done = engine.rowsProcessed;
                this.logger.log(
                    `[club ${dto.clubId}] (${Math.round(((i + 1) / total) * 100)}%) ✓ ${name} — ${secs}s ` +
                    `(acumulado: ${done} filas · insertadas=${engine.totalInserted} reusadas=${engine.totalReused} remapeadas=${engine.totalRemapped} saltadas=${engine.totalSkipped})`,
                );
            }

            if (dto.disableFkChecks) await qr.query('SET FOREIGN_KEY_CHECKS = 1');

            report.newClubId = idMap.clubs.get(dto.clubId) ?? null;

            if (dryRun) {
                await qr.rollbackTransaction();
                report.warnings.push('DRY-RUN: transacción revertida, producción intacta.');
                this.logger.log(
                    `[club ${dto.clubId}] (100%) DRY-RUN completo — ${engine.rowsProcessed} filas simuladas ` +
                    `(insertadas=${engine.totalInserted} reusadas=${engine.totalReused} remapeadas=${engine.totalRemapped} saltadas=${engine.totalSkipped}). Rollback OK.`,
                );
            } else {
                await qr.commitTransaction();
                this.logger.log(
                    `[club ${dto.clubId}] (100%) ✔ RESTAURADO → nuevo id ${report.newClubId} — ${engine.rowsProcessed} filas ` +
                    `(insertadas=${engine.totalInserted} reusadas=${engine.totalReused} remapeadas=${engine.totalRemapped} saltadas=${engine.totalSkipped})`,
                );
            }
        } catch (err) {
            if (qr.isTransactionActive) await qr.rollbackTransaction();
            report.errors.push((err as Error).message);
            this.logger.error(
                `[club ${dto.clubId}] ✗ FALLÓ tras ${engine.rowsProcessed} filas — rollback total: ${(err as Error).message}`,
                (err as Error).stack,
            );
        } finally {
            report.finishedAt = new Date().toISOString();
            await qr.release();
            await backup.destroy();
        }

        return report;
    }

    // ── 1. Club raíz + traducciones ───────────────────────────────────────────

    private async restoreClubCore(e: CopyEngine, club: any, idMap: IdMap) {
        // La sección referenciada (id_secction) primero: catálogo por cliente,
        // solo se copia si no existe en prod.
        if (club.id_secction != null) {
            const newSecId = await this.ensureSection(e, club.id_secction, idMap);
            club = { ...club, id_secction: newSecId ?? null };
        }
        // Si el autor ya no existe, NULL (no perder el club por eso)
        club = await e.nullifyMissingUser('clubs', club, 'creator_user');

        const newId = await e.insertSmart('clubs', club);
        idMap.clubs.set(club.id, newId);

        // Traducciones del club (App\Translations\ClubTranslation: title, locale, club_id)
        for (const t of await e.backup.query('SELECT * FROM `club_translations` WHERE club_id = ?', [club.id])) {
            await e.insertSmart('club_translations', { ...t, club_id: newId });
        }
    }

    private async ensureSection(e: CopyEngine, sectionId: number, idMap: IdMap): Promise<number | null> {
        if (idMap.sections.has(sectionId)) return idMap.sections.get(sectionId)!;

        const [inProd] = await e.qr.query('SELECT id FROM `secction_clubs` WHERE id = ? LIMIT 1', [sectionId]);
        if (inProd) {
            idMap.sections.set(sectionId, sectionId);
            e.bump('reused', 'secction_clubs');
            return sectionId;
        }
        const [sec] = await e.backup.query('SELECT * FROM `secction_clubs` WHERE id = ? LIMIT 1', [sectionId]);
        if (!sec) {
            e.report.warnings.push(`secction_clubs id=${sectionId}: no existe ni en prod ni en backup → NULL`);
            return null;
        }
        const newId = await e.insertSmart('secction_clubs', sec);
        idMap.sections.set(sectionId, newId);
        return newId;
    }

    // ── 2. Secciones del club ─────────────────────────────────────────────────

    private async restoreSections(e: CopyEngine, club: any, idMap: IdMap) {
        const newClubId = idMap.clubs.get(club.id)!;

        const dsc = await e.backup.query('SELECT * FROM `detail_section_clubs` WHERE club_id = ?', [club.id]);
        for (const d of dsc) {
            const newSecId = await this.ensureSection(e, d.section_id, idMap);
            if (newSecId == null) { e.skip('detail_section_clubs', `section_id=${d.section_id} irrecuperable`); continue; }
            await e.insertSmart('detail_section_clubs', { ...d, club_id: newClubId, section_id: newSecId });
        }

        const dusc = await e.backup.query('SELECT * FROM `detail_user_sections_clubs` WHERE club_id = ?', [club.id]);
        for (const d of dusc) {
            if (!(await e.userExists(d.user_id))) { e.skip('detail_user_sections_clubs', `user_id=${d.user_id} no existe`); continue; }
            const newSecId = idMap.sections.get(d.section_id) ?? d.section_id;
            await e.insertSmart('detail_user_sections_clubs', { ...d, club_id: newClubId, section_id: newSecId });
        }
    }

    // ── 3. Miembros, hosts, permisos, viewers, filtros ───────────────────────

    private async restoreMembers(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        for (const cu of await e.backup.query('SELECT * FROM `club_user` WHERE club_id = ?', [clubId])) {
            if (!(await e.userExists(cu.user_id))) { e.skip('club_user', `user_id=${cu.user_id} no existe`); continue; }
            await e.insertSmart('club_user', { ...cu, club_id: newClubId });
        }

        for (const h of await e.backup.query('SELECT * FROM `hosts_club_detailems` WHERE club_id = ?', [clubId])) {
            if (!(await e.userExists(h.user_id))) { e.skip('hosts_club_detailems', `user_id=${h.user_id} no existe`); continue; }
            await e.insertSmart('hosts_club_detailems', { ...h, club_id: newClubId });
        }

        for (const p of await e.backup.query('SELECT * FROM `club_permission` WHERE club_id = ?', [clubId])) {
            // permissions es catálogo: si el permiso ya no existe, saltar
            const [perm] = await e.qr.query('SELECT id FROM `permissions` WHERE id = ? LIMIT 1', [p.permission_id]);
            if (!perm) { e.skip('club_permission', `permission_id=${p.permission_id} no existe`); continue; }
            await e.insertSmart('club_permission', { ...p, club_id: newClubId });
        }

        for (const v of await e.backup.query('SELECT * FROM `club_viewer` WHERE club_id = ?', [clubId])) {
            if (!(await e.userExists(v.user_id))) { e.skip('club_viewer', `user_id=${v.user_id} no existe`); continue; }
            await e.insertPivot('club_viewer', { ...v, club_id: newClubId });
        }

        for (const fv of await e.backup.query('SELECT * FROM `club_filter_values` WHERE club_id = ?', [clubId])) {
            // clubs_filters es catálogo del cliente
            const [filter] = await e.qr.query('SELECT id FROM `clubs_filters` WHERE id = ? LIMIT 1', [fv.filter_id]);
            if (!filter) { e.skip('club_filter_values', `filter_id=${fv.filter_id} no existe`); continue; }
            await e.insertSmart('club_filter_values', { ...fv, club_id: newClubId });
        }
    }

    // ── 4. Social: muros, tareas, tabs (antes que contents/videorooms,
    //      que los referencian vía id_advertisements / id_task) ───────────────

    private async restoreSocial(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        for (const ad of await e.backup.query('SELECT * FROM `advertisements` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('advertisements', ad, 'user_create');
            const newAdId = await e.insertSmart('advertisements', { ...row, club_id: newClubId });
            idMap.advertisements.set(ad.id, newAdId);
            for (const l of await e.backup.query('SELECT * FROM `lang_advertisenments` WHERE advertisenment_id = ?', [ad.id])) {
                await e.insertSmart('lang_advertisenments', { ...l, advertisenment_id: newAdId });
            }
        }

        for (const t of await e.backup.query('SELECT * FROM `tasks` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('tasks', t, 'user_create');
            const newTaskId = await e.insertSmart('tasks', { ...row, club_id: newClubId });
            idMap.tasks.set(t.id, newTaskId);
            for (const l of await e.backup.query('SELECT * FROM `lang_task` WHERE task_id = ?', [t.id])) {
                await e.insertSmart('lang_task', { ...l, task_id: newTaskId });
            }
        }

        for (const tab of await e.backup.query('SELECT * FROM `tabs` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('tabs', tab, 'user_create');
            const newTabId = await e.insertSmart('tabs', { ...row, club_id: newClubId });
            idMap.tabs.set(tab.id, newTabId);
            for (const l of await e.backup.query('SELECT * FROM `lang_tabs` WHERE tabs_id = ?', [tab.id])) {
                await e.insertSmart('lang_tabs', { ...l, tabs_id: newTabId });
            }
        }
    }

    // ── 4b. Mini-juegos del club (sopa de letras, crucigrama, drag&drop,
    //        ahorcado, memoria, secuencias, completar frases) ─────────────────

    private async restoreGames(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        // Sopa de letras
        for (const g of await e.backup.query('SELECT * FROM `alphabet_soups` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('alphabet_soups', g, 'user_id');
            const newId = await e.insertSmart('alphabet_soups', { ...row, club_id: newClubId });
            idMap.games.alphabetSoup.set(g.id, newId);
        }

        // Completar frases (⚠ FK de club es 'id_club', no 'club_id')
        for (const g of await e.backup.query('SELECT * FROM `complete_sentences` WHERE id_club = ?', [clubId])) {
            const row = await e.nullifyMissingUser('complete_sentences', g, 'user_create');
            const newId = await e.insertSmart('complete_sentences', { ...row, id_club: newClubId });
            idMap.games.completeSentences.set(g.id, newId);
        }

        // Crucigrama + palabras/pistas
        for (const g of await e.backup.query('SELECT * FROM `crosswords` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('crosswords', g, 'user_id');
            const newId = await e.insertSmart('crosswords', { ...row, club_id: newClubId });
            idMap.games.crossword.set(g.id, newId);
            for (const w of await e.backup.query('SELECT * FROM `words_hints` WHERE crosswords_id = ?', [g.id])) {
                await e.insertSmart('words_hints', { ...w, crosswords_id: newId });
            }
        }

        // Arrastrar y soltar + pares palabra/imagen
        for (const g of await e.backup.query('SELECT * FROM `drag_drops` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('drag_drops', g, 'user_id');
            const newId = await e.insertSmart('drag_drops', { ...row, club_id: newClubId });
            idMap.games.dragDrop.set(g.id, newId);
            for (const w of await e.backup.query('SELECT * FROM `words__image__drag_drops` WHERE drag_drop_id = ?', [g.id])) {
                await e.insertSmart('words__image__drag_drops', { ...w, drag_drop_id: newId });
            }
        }

        // Ahorcado + frases/palabras
        for (const g of await e.backup.query('SELECT * FROM `hanging_games` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('hanging_games', g, 'user_id');
            const newId = await e.insertSmart('hanging_games', { ...row, club_id: newClubId });
            idMap.games.hangingGame.set(g.id, newId);
            for (const p of await e.backup.query('SELECT * FROM `phrases_words` WHERE hanging_id = ?', [g.id])) {
                await e.insertSmart('phrases_words', { ...p, hanging_id: newId });
            }
        }

        // Memoria
        for (const g of await e.backup.query('SELECT * FROM `memory_games` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('memory_games', g, 'user_create');
            const newId = await e.insertSmart('memory_games', { ...row, club_id: newClubId });
            idMap.games.memoryGame.set(g.id, newId);
        }

        // Secuencia de tiempo + pasos
        for (const g of await e.backup.query('SELECT * FROM `time_sequences` WHERE club_id = ?', [clubId])) {
            const row = await e.nullifyMissingUser('time_sequences', g, 'user_id');
            const newId = await e.insertSmart('time_sequences', { ...row, club_id: newClubId });
            idMap.games.timeSequence.set(g.id, newId);
            for (const s of await e.backup.query('SELECT * FROM `sequences` WHERE time_sequence_id = ?', [g.id])) {
                await e.insertSmart('sequences', { ...s, time_sequence_id: newId });
            }
        }
    }

    /** Intentos de usuario en cada juego (tabla '*_users' / '*_history_users'). */
    private async restoreGameAttempts(e: CopyEngine, idMap: IdMap) {
        for (const [oldId, newId] of idMap.games.alphabetSoup.entries()) {
            for (const row of await e.backup.query('SELECT * FROM `alphabet_soup_users` WHERE alhabet_soup_id = ?', [oldId])) {
                if (!(await e.userExists(row.user_id))) { e.skip('alphabet_soup_users', `user_id=${row.user_id} no existe`); continue; }
                await e.insertSmart('alphabet_soup_users', { ...row, alhabet_soup_id: newId });
            }
        }

        for (const [oldId, newId] of idMap.games.completeSentences.entries()) {
            for (const row of await e.backup.query('SELECT * FROM `complete_sentences_users` WHERE id_complete_sentences = ?', [oldId])) {
                if (!(await e.userExists(row.user_id))) { e.skip('complete_sentences_users', `user_id=${row.user_id} no existe`); continue; }
                await e.insertSmart('complete_sentences_users', { ...row, id_complete_sentences: newId });
            }
            for (const row of await e.backup.query('SELECT * FROM `complete_sentences_history_users` WHERE complete_sentences_id = ?', [oldId])) {
                if (!(await e.userExists(row.user_id))) { e.skip('complete_sentences_history_users', `user_id=${row.user_id} no existe`); continue; }
                await e.insertSmart('complete_sentences_history_users', { ...row, complete_sentences_id: newId });
            }
        }

        for (const [oldId, newId] of idMap.games.hangingGame.entries()) {
            for (const row of await e.backup.query('SELECT * FROM `hanging_game_users` WHERE hanging_game_id = ?', [oldId])) {
                if (!(await e.userExists(row.user_id))) { e.skip('hanging_game_users', `user_id=${row.user_id} no existe`); continue; }
                await e.insertSmart('hanging_game_users', { ...row, hanging_game_id: newId });
            }
        }

        for (const [oldId, newId] of idMap.games.memoryGame.entries()) {
            for (const row of await e.backup.query('SELECT * FROM `memory_game_users` WHERE id_memory_game = ?', [oldId])) {
                if (!(await e.userExists(row.user_id))) { e.skip('memory_game_users', `user_id=${row.user_id} no existe`); continue; }
                await e.insertSmart('memory_game_users', { ...row, id_memory_game: newId });
            }
        }

        for (const [oldId, newId] of idMap.games.timeSequence.entries()) {
            for (const row of await e.backup.query('SELECT * FROM `time_sequence_users` WHERE time_sequence_id = ?', [oldId])) {
                if (!(await e.userExists(row.user_id))) { e.skip('time_sequence_users', `user_id=${row.user_id} no existe`); continue; }
                await e.insertSmart('time_sequence_users', { ...row, time_sequence_id: newId });
            }
        }
    }

    // ── 5. Evaluaciones ───────────────────────────────────────────────────────

    private async restoreEvaluations(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        // Universo de evaluaciones del club: pivote ∪ contents ∪ videorooms ∪ detalles
        const idRows = await e.backup.query(
            `SELECT evaluation_id id FROM \`evaluation_clubs\` WHERE club_id = ?
       UNION SELECT evaluation_id FROM \`contents\` WHERE club_id = ? AND evaluation_id IS NOT NULL
       UNION SELECT evaluation_id FROM \`videorooms\` WHERE club_id = ? AND evaluation_id IS NOT NULL
       UNION SELECT d.id_evaluation FROM \`detail_evaluation_video_rooms\` d
             INNER JOIN \`videorooms\` v ON v.id = d.id_videoroom WHERE v.club_id = ?`,
            [clubId, clubId, clubId, clubId],
        );

        for (const { id: evalId } of idRows) {
            const [evalRow] = await e.backup.query('SELECT * FROM `evaluations` WHERE id = ? LIMIT 1', [evalId]);
            if (!evalRow) { e.skip('evaluations', `id=${evalId} no está en el backup`); continue; }

            const newEvalId = await e.insertSmart('evaluations', evalRow);
            idMap.evaluations.set(evalId, newEvalId);

            // Árbol solo si la evaluación fue insertada (nueva o remapeada).
            // Si fue REUSADA (sigue viva en prod) su árbol ya existe.
            if (e.lastAction !== 'reused') {
                await this.restoreEvaluationTree(e, evalId, newEvalId, idMap);
            }
        }

        // Pivote evaluation_clubs
        for (const ec of await e.backup.query('SELECT * FROM `evaluation_clubs` WHERE club_id = ?', [clubId])) {
            const newEvalId = idMap.evaluations.get(ec.evaluation_id);
            if (!newEvalId) continue;
            await e.insertSmart('evaluation_clubs', { ...ec, club_id: newClubId, evaluation_id: newEvalId });
        }
    }

    private async restoreEvaluationTree(e: CopyEngine, oldEvalId: number, newEvalId: number, idMap: IdMap) {
        // PASO 1: todas las preguntas + opciones (condiciones DESPUÉS: pueden
        // apuntar a preguntas/opciones posteriores → el mapa debe estar completo)
        const questions = await e.backup.query(
            'SELECT * FROM `questions` WHERE evaluation_id = ? ORDER BY id ASC', [oldEvalId],
        );
        for (const q of questions) {
            const newQId = await e.insertSmart('questions', { ...q, evaluation_id: newEvalId });
            idMap.questions.set(q.id, newQId);
            for (const o of await e.backup.query('SELECT * FROM `options` WHERE question_id = ?', [q.id])) {
                const newOptId = await e.insertSmart('options', { ...o, question_id: newQId });
                idMap.options.set(o.id, newOptId);
            }
        }

        // PASO 2: condiciones (flujo condicional pregunta-a-pregunta)
        for (const q of questions) {
            for (const c of await e.backup.query('SELECT * FROM `question_conditions` WHERE question_id = ?', [q.id])) {
                await e.insertSmart('question_conditions', {
                    ...c,
                    question_id: idMap.questions.get(c.question_id) ?? c.question_id,
                    trigger_question_id: c.trigger_question_id != null
                        ? idMap.questions.get(c.trigger_question_id) ?? c.trigger_question_id : null,
                    trigger_option_id: c.trigger_option_id != null
                        ? idMap.options.get(c.trigger_option_id) ?? c.trigger_option_id : null,
                });
            }
        }

        // Preguntas adicionales (FK: evaluation_id; sus opciones: question_id)
        for (const aq of await e.backup.query('SELECT * FROM `additional_questions` WHERE evaluation_id = ?', [oldEvalId])) {
            const newAqId = await e.insertSmart('additional_questions', { ...aq, evaluation_id: newEvalId });
            idMap.additionalQuestions.set(aq.id, newAqId);
            for (const ao of await e.backup.query('SELECT * FROM `additional_question_options` WHERE question_id = ?', [aq.id])) {
                const newAoId = await e.insertSmart('additional_question_options', { ...ao, question_id: newAqId });
                idMap.additionalQuestionOptions.set(ao.id, newAoId);
            }
        }

        // Plantilla de certificado (PK uuid)
        for (const cert of await e.backup.query('SELECT * FROM `certificates` WHERE evaluation_id = ?', [oldEvalId])) {
            await e.insertUuid('certificates', { ...cert, evaluation_id: newEvalId });
        }
    }

    // ── 6. Contenidos ─────────────────────────────────────────────────────────

    private async restoreContents(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        // Padres uuid de contents
        for (const f of await e.backup.query('SELECT * FROM `folders` WHERE club_id = ?', [clubId])) {
            await e.insertUuid('folders', { ...f, club_id: newClubId });
        }
        for (const ev of await e.backup.query('SELECT * FROM `events` WHERE club_id = ?', [clubId])) {
            await e.insertUuid('events', { ...ev, club_id: newClubId });
        }
        for (const cat of await e.backup.query('SELECT * FROM `categories` WHERE club_id = ?', [clubId])) {
            await e.insertUuid('categories', { ...cat, club_id: newClubId });
        }

        for (const c of await e.backup.query('SELECT * FROM `contents` WHERE club_id = ?', [clubId])) {
            let row = await e.nullifyMissingUser('contents', c, 'user_create');
            row = {
                ...row,
                club_id: newClubId,
                evaluation_id: c.evaluation_id != null
                    ? idMap.evaluations.get(c.evaluation_id) ?? c.evaluation_id : null,
                id_task: c.id_task != null ? idMap.tasks.get(c.id_task) ?? c.id_task : c.id_task,
                id_advertisements: c.id_advertisements != null
                    ? idMap.advertisements.get(c.id_advertisements) ?? c.id_advertisements : c.id_advertisements,
                // folder_id / event_id son uuid → no cambian
            };
            const newContentId = await e.insertSmart('contents', row);
            idMap.contents.set(c.id, newContentId);
            const contentWasReused = e.lastAction === 'reused';

            if (contentWasReused) continue; // su subárbol ya vive en prod

            for (const l of await e.backup.query('SELECT * FROM `lang_contents` WHERE content_id = ?', [c.id])) {
                await e.insertSmart('lang_contents', { ...l, content_id: newContentId });
            }

            for (const emb of await e.backup.query('SELECT * FROM `content_embed` WHERE content_id = ?', [c.id])) {
                await e.insertUuid('content_embed', { ...emb, content_id: newContentId });
            }

            // Imágenes: pivote content_images → images (+ lang_images)
            for (const ci of await e.backup.query('SELECT * FROM `content_images` WHERE content_id = ?', [c.id])) {
                // El nombre real de la FK varía entre codebases: detectarlo en la fila
                const imgKey = 'image_id' in ci ? 'image_id' : 'images_id';
                const oldImgId = ci[imgKey];
                let newImgId = idMap.images.get(oldImgId);
                if (newImgId == null) {
                    const [img] = await e.backup.query('SELECT * FROM `images` WHERE id = ? LIMIT 1', [oldImgId]);
                    if (img) {
                        newImgId = await e.insertSmart('images', img);
                        idMap.images.set(oldImgId, newImgId);
                        if (e.lastAction !== 'reused') {
                            for (const li of await e.backup.query('SELECT * FROM `lang_images` WHERE images_id = ?', [oldImgId])) {
                                await e.insertSmart('lang_images', { ...li, images_id: newImgId });
                            }
                        }
                    } else {
                        newImgId = oldImgId; // referencia rota ya en backup: copiar tal cual
                    }
                }
                await e.insertSmart('content_images', { ...ci, content_id: newContentId, [imgKey]: newImgId });
            }

            for (const cp of await e.backup.query('SELECT * FROM `content_category` WHERE content_id = ?', [c.id])) {
                await e.insertPivot('content_category', { ...cp, content_id: newContentId });
            }

            // SCORM: columnas reales id_content / id_user
            for (const s of await e.backup.query('SELECT * FROM `scorms` WHERE id_content = ?', [c.id])) {
                const sRow = await e.nullifyMissingUser('scorms', s, 'id_user');
                const newScormId = await e.insertSmart('scorms', { ...sRow, id_content: newContentId });
                idMap.scorms.set(s.id, newScormId);
            }
        }
    }

    // ── 7. Videorooms ─────────────────────────────────────────────────────────

    private async restoreVideorooms(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        // Incluye soft-deleted: SQL crudo no filtra deleted_at → se copian tal cual
        const videorooms = await e.backup.query('SELECT * FROM `videorooms` WHERE club_id = ?', [clubId]);

        for (const vr of videorooms) {
            const newVr = {
                ...(await e.nullifyMissingUser('videorooms', vr, 'user_create')),
                club_id: newClubId,
                evaluation_id: vr.evaluation_id != null
                    ? idMap.evaluations.get(vr.evaluation_id) ?? vr.evaluation_id : null,
                content_id: vr.content_id != null
                    ? idMap.contents.get(vr.content_id) ?? vr.content_id : null,
                id_advertisements: vr.id_advertisements != null
                    ? idMap.advertisements.get(vr.id_advertisements) ?? vr.id_advertisements : vr.id_advertisements,
                id_task: vr.id_task != null ? idMap.tasks.get(vr.id_task) ?? vr.id_task : vr.id_task,
            };
            const newVrId = await e.insertSmart('videorooms', newVr);
            idMap.videorooms.set(vr.id, newVrId);

            // videoroom_content (⚠ forma provisional; falta el modelo)
            try {
                for (const vc of await e.backup.query('SELECT * FROM `videoroom_content` WHERE videoroom_id = ?', [vr.id])) {
                    await e.insertPivot('videoroom_content', {
                        ...vc,
                        videoroom_id: newVrId,
                        content_id: idMap.contents.get(vc.content_id) ?? vc.content_id,
                    });
                }
            } catch {
                e.report.warnings.push('videoroom_content: tabla/columnas distintas a lo asumido (falta el modelo VideoRoomContent)');
            }

            for (const d of await e.backup.query('SELECT * FROM `detail_evaluation_video_rooms` WHERE id_videoroom = ?', [vr.id])) {
                await e.insertSmart('detail_evaluation_video_rooms', {
                    ...d,
                    id_videoroom: newVrId,
                    id_evaluation: idMap.evaluations.get(d.id_evaluation) ?? d.id_evaluation,
                });
            }

            for (const d of await e.backup.query('SELECT * FROM `detail_video_room_activitaties` WHERE id_videoroom = ?', [vr.id])) {
                const gameKey = d.type ? GAME_TYPE_MAP[String(d.type).toLowerCase()] : undefined;
                const newActivityId = gameKey
                    ? idMap.games[gameKey].get(d.id_activities) ?? d.id_activities
                    : d.id_activities;
                if (!gameKey) {
                    e.report.warnings.push(
                        `detail_video_room_activitaties id=${d.id}: type="${d.type}" no reconocido en GAME_TYPE_MAP, id_activities copiado sin remapear`,
                    );
                }
                await e.insertSmart('detail_video_room_activitaties', {
                    ...d, id_videoroom: newVrId, id_activities: newActivityId,
                });
            }

            for (const d of await e.backup.query('SELECT * FROM `detail_tasks_videorooms` WHERE videorooms_id = ?', [vr.id])) {
                await e.insertSmart('detail_tasks_videorooms', {
                    ...d,
                    videorooms_id: newVrId,
                    tasks_id: idMap.tasks.get(d.tasks_id) ?? d.tasks_id,
                });
            }

            for (const d of await e.backup.query('SELECT * FROM `detail_walls_video_rooms` WHERE videorooms_id = ?', [vr.id])) {
                await e.insertSmart('detail_walls_video_rooms', {
                    ...d,
                    videorooms_id: newVrId,
                    advertisements_id: idMap.advertisements.get(d.advertisements_id) ?? d.advertisements_id,
                });
            }

            for (const d of await e.backup.query('SELECT * FROM `detail_users_private_videorroms` WHERE videoroom_id = ?', [vr.id])) {
                if (!(await e.userExists(d.user_id))) { e.skip('detail_users_private_videorroms', `user_id=${d.user_id} no existe`); continue; }
                await e.insertSmart('detail_users_private_videorroms', { ...d, videoroom_id: newVrId });
            }

            await this.restoreSelftEvaluations(e, vr.id, newVrId, clubId, idMap);
        }
    }

    private async restoreSelftEvaluations(e: CopyEngine, oldVrId: number, newVrId: number, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        for (const d of await e.backup.query('SELECT * FROM `detail_selft_evaluation_videorooms` WHERE id_videoroom = ?', [oldVrId])) {
            const seId = d.selft_evaluations_id;
            let newSeId = idMap.selftEvaluations.get(seId);

            if (newSeId == null) {
                const [se] = await e.backup.query('SELECT * FROM `selft_evaluations` WHERE id = ? LIMIT 1', [seId]);
                if (!se) { e.skip('selft_evaluations', `id=${seId} no está en el backup`); continue; }

                newSeId = await e.insertSmart('selft_evaluations', {
                    ...(await e.nullifyMissingUser('selft_evaluations', se, 'user_id')),
                    club_id: se.club_id === clubId ? newClubId : se.club_id, // puede ser compartida (share_clubs)
                });
                idMap.selftEvaluations.set(seId, newSeId);

                if (e.lastAction !== 'reused') {
                    for (const q of await e.backup.query('SELECT * FROM `questions_selft_evaluations` WHERE selft_evaluations_id = ?', [seId])) {
                        const newQseId = await e.insertSmart('questions_selft_evaluations', { ...q, selft_evaluations_id: newSeId });
                        idMap.questionsSelft.set(q.id, newQseId);
                        for (const o of await e.backup.query('SELECT * FROM `options_self_evaluations` WHERE questions_selft_evaluations_id = ?', [q.id])) {
                            await e.insertSmart('options_self_evaluations', { ...o, questions_selft_evaluations_id: newQseId });
                        }
                    }
                }
            }

            await e.insertSmart('detail_selft_evaluation_videorooms', {
                ...d, id_videoroom: newVrId, selft_evaluations_id: newSeId,
            });
        }
    }

    // ── 7b. Progreso de usuarios en videorooms (crítico: sin esto los alumnos
    //        recuperan el curso pero pierden su avance) ────────────────────────

    private async restoreVideoroomProgress(e: CopyEngine, idMap: IdMap) {
        for (const [oldVrId, newVrId] of idMap.videorooms.entries()) {
            for (const row of await e.backup.query('SELECT * FROM `general_pogress_video_rooms` WHERE id_videoroom = ?', [oldVrId])) {
                if (!(await e.userExists(row.id_user))) { e.skip('general_pogress_video_rooms', `id_user=${row.id_user} no existe`); continue; }
                await e.insertSmart('general_pogress_video_rooms', { ...row, id_videoroom: newVrId });
            }

            for (const row of await e.backup.query('SELECT * FROM `user_pogress_video_rooms` WHERE id_videoroom = ?', [oldVrId])) {
                if (!(await e.userExists(row.id_user))) { e.skip('user_pogress_video_rooms', `id_user=${row.id_user} no existe`); continue; }
                await e.insertSmart('user_pogress_video_rooms', {
                    ...row,
                    id_videoroom: newVrId,
                    id_content: row.id_content != null ? idMap.contents.get(row.id_content) ?? row.id_content : null,
                });
            }

            for (const row of await e.backup.query('SELECT * FROM `user_pogress_task_videorooms` WHERE id_videoroom = ?', [oldVrId])) {
                if (!(await e.userExists(row.id_user))) { e.skip('user_pogress_task_videorooms', `id_user=${row.id_user} no existe`); continue; }
                await e.insertSmart('user_pogress_task_videorooms', {
                    ...row,
                    id_videoroom: newVrId,
                    id_task: row.id_task != null ? idMap.tasks.get(row.id_task) ?? row.id_task : null,
                });
            }

            for (const row of await e.backup.query('SELECT * FROM `user_pogress_forum_videorooms` WHERE id_videoroom = ?', [oldVrId])) {
                if (!(await e.userExists(row.id_user))) { e.skip('user_pogress_forum_videorooms', `id_user=${row.id_user} no existe`); continue; }
                await e.insertSmart('user_pogress_forum_videorooms', {
                    ...row,
                    id_videoroom: newVrId,
                    id_advertisements: row.id_advertisements != null
                        ? idMap.advertisements.get(row.id_advertisements) ?? row.id_advertisements : null,
                });
            }

            for (const row of await e.backup.query('SELECT * FROM `user_pogress_evaluation_video_rooms` WHERE id_videoroom = ?', [oldVrId])) {
                if (!(await e.userExists(row.id_user))) { e.skip('user_pogress_evaluation_video_rooms', `id_user=${row.id_user} no existe`); continue; }
                await e.insertSmart('user_pogress_evaluation_video_rooms', {
                    ...row,
                    id_videoroom: newVrId,
                    id_evaluation: row.id_evaluation != null ? idMap.evaluations.get(row.id_evaluation) ?? row.id_evaluation : null,
                });
            }

            for (const row of await e.backup.query('SELECT * FROM `user_pogress_selft_evaluation_videorroms` WHERE id_videoroom = ?', [oldVrId])) {
                if (!(await e.userExists(row.user_id))) { e.skip('user_pogress_selft_evaluation_videorroms', `user_id=${row.user_id} no existe`); continue; }
                await e.insertSmart('user_pogress_selft_evaluation_videorroms', {
                    ...row,
                    id_videoroom: newVrId,
                    selft_evaluations_id: idMap.selftEvaluations.get(row.selft_evaluations_id) ?? row.selft_evaluations_id,
                });
            }

            // Actividades/juegos: remapear id_activity igual que en detail_video_room_activitaties
            for (const row of await e.backup.query('SELECT * FROM `user_pogress_video_room_activities` WHERE id_videoroom = ?', [oldVrId])) {
                if (!(await e.userExists(row.id_user))) { e.skip('user_pogress_video_room_activities', `id_user=${row.id_user} no existe`); continue; }
                const gameKey = row.type ? GAME_TYPE_MAP[String(row.type).toLowerCase()] : undefined;
                const newActivityId = gameKey ? idMap.games[gameKey].get(row.id_activity) ?? row.id_activity : row.id_activity;
                await e.insertSmart('user_pogress_video_room_activities', { ...row, id_videoroom: newVrId, id_activity: newActivityId });
            }
        }

        // Progreso de SCORM: keyed por id_scorm, no por videoroom
        for (const [oldScormId, newScormId] of idMap.scorms.entries()) {
            for (const row of await e.backup.query('SELECT * FROM `pogress_scorm_users` WHERE id_scorm = ?', [oldScormId])) {
                if (!(await e.userExists(row.id_user))) { e.skip('pogress_scorm_users', `id_user=${row.id_user} no existe`); continue; }
                await e.insertSmart('pogress_scorm_users', { ...row, id_scorm: newScormId });
            }
        }
    }

    // ── 8. Datos de usuario (notas, respuestas, entregas, visitas, comments) ──

    private async restoreUserData(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        // Por cada evaluación del universo del club (incluye reusadas: si la
        // evaluación sobrevivió, sus evaluation_users probablemente también →
        // insertSmart los detecta como "misma fila" y los reusa sin duplicar).
        for (const [oldEvalId, newEvalId] of idMap.evaluations.entries()) {
            for (const eu of await e.backup.query('SELECT * FROM `evaluation_users` WHERE evaluation_id = ?', [oldEvalId])) {
                if (!(await e.userExists(eu.user_id))) { e.skip('evaluation_users', `user_id=${eu.user_id} no existe`); continue; }
                await e.insertSmart('evaluation_users', { ...eu, evaluation_id: newEvalId });
            }
            for (const eh of await e.backup.query('SELECT * FROM `evaluation_history` WHERE evaluation_id = ?', [oldEvalId])) {
                if (!(await e.userExists(eh.user_id))) { e.skip('evaluation_history', `user_id=${eh.user_id} no existe`); continue; }
                await e.insertSmart('evaluation_history', { ...eh, evaluation_id: newEvalId });
            }
            for (const a of await e.backup.query('SELECT * FROM `answers` WHERE evaluation_id = ?', [oldEvalId])) {
                if (a.user_id != null && !(await e.userExists(a.user_id))) { e.skip('answers', `user_id=${a.user_id} no existe`); continue; }
                await e.insertSmart('answers', {
                    ...a,
                    evaluation_id: newEvalId,
                    question_id: a.question_id != null ? idMap.questions.get(a.question_id) ?? a.question_id : null,
                    option_id: a.option_id != null ? idMap.options.get(a.option_id) ?? a.option_id : null,
                });
            }
            // Columnas reales: additional_question_id / addi_question_option_id
            for (const aqa of await e.backup.query('SELECT * FROM `additional_question_answers` WHERE evaluation_id = ?', [oldEvalId])) {
                if (aqa.user_id != null && !(await e.userExists(aqa.user_id))) { e.skip('additional_question_answers', `user_id=${aqa.user_id} no existe`); continue; }
                await e.insertSmart('additional_question_answers', {
                    ...aqa,
                    evaluation_id: newEvalId,
                    additional_question_id: aqa.additional_question_id != null
                        ? idMap.additionalQuestions.get(aqa.additional_question_id) ?? aqa.additional_question_id : null,
                    addi_question_option_id: aqa.addi_question_option_id != null
                        ? idMap.additionalQuestionOptions.get(aqa.addi_question_option_id) ?? aqa.addi_question_option_id : null,
                });
            }
        }

        // Visitas a contenidos (FK: user_id + content_id)
        for (const [oldContentId, newContentId] of idMap.contents.entries()) {
            for (const uvc of await e.backup.query('SELECT * FROM `user_visit_contents` WHERE content_id = ?', [oldContentId])) {
                if (!(await e.userExists(uvc.user_id))) { e.skip('user_visit_contents', `user_id=${uvc.user_id} no existe`); continue; }
                await e.insertSmart('user_visit_contents', { ...uvc, content_id: newContentId });
            }
        }

        // Entregas de tareas
        for (const [oldTaskId, newTaskId] of idMap.tasks.entries()) {
            for (const at of await e.backup.query('SELECT * FROM `attachment_tasks` WHERE task_id = ?', [oldTaskId])) {
                if (!(await e.userExists(at.user_id))) { e.skip('attachment_tasks', `user_id=${at.user_id} no existe`); continue; }
                await e.insertSmart('attachment_tasks', { ...at, task_id: newTaskId });
            }
        }

        // Certificados emitidos (club_id ⚠ verificar que la columna exista)
        try {
            for (const cert of await e.backup.query('SELECT * FROM `user_certificates_resources` WHERE club_id = ?', [clubId])) {
                if (cert.user_id != null && !(await e.userExists(cert.user_id))) { e.skip('user_certificates_resources', `user_id=${cert.user_id} no existe`); continue; }
                await e.insertSmart('user_certificates_resources', { ...cert, club_id: newClubId });
            }
        } catch {
            e.report.warnings.push('user_certificates_resources: no tiene columna club_id (verificar cómo se enlaza al club)');
        }

        // Comentarios: contenidos, muros y tareas
        for (const [oldId, newId] of idMap.contents.entries()) {
            await this.restoreCommentPivot(e, 'comment_content', 'content_id', oldId, newId, idMap, true);
        }
        for (const [oldId, newId] of idMap.advertisements.entries()) {
            await this.restoreCommentPivot(e, 'comment_advertisement', 'advertisenment_id', oldId, newId, idMap, false);
        }
        for (const [oldId, newId] of idMap.tasks.entries()) {
            await this.restoreCommentPivot(e, 'comment_task', 'task_id', oldId, newId, idMap, true);
        }
    }

    private async restoreCommentPivot(
        e: CopyEngine,
        pivotTable: string,
        fkCol: string,
        oldEntityId: number,
        newEntityId: number,
        idMap: IdMap,
        isCompositePivot: boolean,
    ) {
        let rows: any[];
        try {
            rows = await e.backup.query(`SELECT * FROM \`${pivotTable}\` WHERE \`${fkCol}\` = ?`, [oldEntityId]);
        } catch {
            e.report.warnings.push(`${pivotTable}: tabla/columna distinta a lo asumido — verificar`);
            return;
        }
        for (const row of rows) {
            const newCommentId = await this.ensureComment(e, row.comment_id, idMap);
            if (newCommentId == null) continue;
            const payload = { ...row, comment_id: newCommentId, [fkCol]: newEntityId };
            if (isCompositePivot) await e.insertPivot(pivotTable, payload);
            else await e.insertSmart(pivotTable, payload);
        }
    }

    /** Copia el comment + respuestas (con su auto-referencia) + reacciones. */
    private async ensureComment(e: CopyEngine, commentId: number, idMap: IdMap): Promise<number | null> {
        if (idMap.comments.has(commentId)) return idMap.comments.get(commentId)!;

        const [comment] = await e.backup.query('SELECT * FROM `comments` WHERE id = ? LIMIT 1', [commentId]);
        if (!comment) return null;
        if (comment.user_id != null && !(await e.userExists(comment.user_id))) {
            e.skip('comments', `id=${commentId}: user_id=${comment.user_id} no existe`);
            return null;
        }

        const newCId = await e.insertSmart('comments', comment);
        idMap.comments.set(commentId, newCId);
        if (e.lastAction === 'reused') return newCId; // sus hijos ya viven en prod

        // Respuestas: ORDER BY id ASC → el padre de una respuesta anidada
        // (answer_comment_id) siempre se inserta antes y ya está en el mapa.
        for (const ac of await e.backup.query(
            'SELECT * FROM `answer_comments` WHERE comment_id = ? ORDER BY id ASC', [commentId],
        )) {
            if (ac.user_id != null && !(await e.userExists(ac.user_id))) { e.skip('answer_comments', `user_id=${ac.user_id} no existe`); continue; }
            const newAcId = await e.insertSmart('answer_comments', {
                ...ac,
                comment_id: newCId,
                answer_comment_id: ac.answer_comment_id != null
                    ? idMap.answerComments.get(ac.answer_comment_id) ?? ac.answer_comment_id : null,
            });
            idMap.answerComments.set(ac.id, newAcId);
        }

        for (const r of await e.backup.query('SELECT * FROM `reactions_comments` WHERE comment_id = ?', [commentId])) {
            if (r.user_id != null && !(await e.userExists(r.user_id))) { e.skip('reactions_comments', `user_id=${r.user_id} no existe`); continue; }
            await e.insertSmart('reactions_comments', {
                ...r,
                comment_id: newCId,
                answer_comment_id: r.answer_comment_id != null
                    ? idMap.answerComments.get(r.answer_comment_id) ?? r.answer_comment_id : null,
            });
        }

        return newCId;
    }

    // ── 9. Pivotes finales ────────────────────────────────────────────────────

    private async restoreFinalPivots(e: CopyEngine, clubId: number, idMap: IdMap) {
        const newClubId = idMap.clubs.get(clubId)!;

        // thread_club: los threads de Messenger NO se restauran aquí →
        // solo re-enlazar los que sigan vivos en producción.
        for (const t of await e.backup.query('SELECT * FROM `thread_club` WHERE club_id = ?', [clubId])) {
            const [thread] = await e.qr.query('SELECT id FROM `threads` WHERE id = ? LIMIT 1', [t.thread_id]);
            if (!thread) { e.skip('thread_club', `thread_id=${t.thread_id} no existe en prod (chats no restaurados)`); continue; }
            await e.insertPivot('thread_club', { ...t, club_id: newClubId });
        }

        // progress_report_clubs — ⚠ el código Laravel usa DOS nombres distintos
        for (const tableName of ['progress_report_clubs', 'progress_reports_clubs']) {
            try {
                const rows = await e.backup.query(`SELECT * FROM \`${tableName}\` WHERE club_id = ?`, [clubId]);
                for (const prc of rows) {
                    const [pr] = await e.qr.query('SELECT id FROM `progress_reports` WHERE id = ? LIMIT 1', [prc.progress_report_id]);
                    if (!pr) { e.skip(tableName, `progress_report_id=${prc.progress_report_id} no existe en prod`); continue; }
                    await e.insertPivot(tableName, { ...prc, club_id: newClubId });
                }
                break; // la primera que exista es la real
            } catch { /* probar el siguiente nombre */ }
        }
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    private emptyIdMap(): IdMap {
        return {
            clubs: new Map(), sections: new Map(), videorooms: new Map(),
            contents: new Map(), scorms: new Map(), evaluations: new Map(),
            questions: new Map(), options: new Map(), additionalQuestions: new Map(),
            additionalQuestionOptions: new Map(), images: new Map(),
            advertisements: new Map(), tasks: new Map(), tabs: new Map(),
            comments: new Map(), answerComments: new Map(),
            selftEvaluations: new Map(), questionsSelft: new Map(),
            games: {
                alphabetSoup: new Map(), completeSentences: new Map(),
                crossword: new Map(), dragDrop: new Map(), hangingGame: new Map(),
                memoryGame: new Map(), timeSequence: new Map(),
            },
        };
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CopyEngine — inserciones con detección de colisiones y filtrado de columnas
// ═════════════════════════════════════════════════════════════════════════════

type LastAction = 'inserted' | 'remapped' | 'reused' | 'none';

/**
 * MySQL legacy (Laravel 5 + modo no estricto en su momento) suele tener
 * fechas placeholder '0000-00-00' / '0000-00-00 00:00:00'. mysql2 con el
 * sql_mode estricto de producción actual las rechaza en el INSERT
 * ("Incorrect date value"). No representan una fecha real → se sanean:
 * NULL si la columna lo permite, o 1970-01-01 si es NOT NULL (ver filterCols).
 */
interface ColMeta {
    nullable: boolean;
    dataType: string; // 'date' | 'datetime' | 'timestamp' | ...
}

class CopyEngine {
    /** Qué pasó con el último insertSmart/insertUuid (para decidir si copiar el subárbol). */
    lastAction: LastAction = 'none';

    /** Contadores globales para el log de progreso por filas. */
    rowsProcessed = 0;
    totalInserted = 0;
    totalReused = 0;
    totalRemapped = 0;
    totalSkipped = 0;

    private readonly ROWS_LOG_EVERY = 100;
    private prodColsCache = new Map<string, Map<string, ColMeta>>();
    private userCache = new Map<number, boolean>();

    constructor(
        readonly qr: QueryRunner,
        readonly backup: DataSource,
        readonly report: RestoreReport,
        private readonly logger: Logger,
        private readonly clubId: number,
    ) { }

    // ── Inserción principal (PK numérica autoincrement) ───────────────────────

    async insertSmart(table: string, row: Record<string, any>): Promise<number> {
        const clean = await this.filterCols(table, row);

        if (clean.id != null) {
            const [existing] = await this.qr.query(
                `SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [clean.id],
            );
            if (existing) {
                if (this.looksSame(existing, clean)) {
                    // Misma fila que sobrevivió en prod (recurso compartido) → reutilizar
                    this.lastAction = 'reused';
                    this.bump('reused', table);
                    return Number(clean.id);
                }
                // El autoincrement reutilizó el id para OTRA fila → registro nuevo
                const { id, ...rest } = clean;
                const newId = await this.rawInsert(table, rest);
                this.lastAction = 'remapped';
                this.bump('remapped', table);
                return newId;
            }
        }

        const finalId = await this.rawInsert(table, clean);
        this.lastAction = 'inserted';
        this.bump('inserted', table);
        return clean.id != null ? Number(clean.id) : finalId;
    }

    // ── Inserción para PK uuid (folders, events, categories, certificates…) ───

    async insertUuid(table: string, row: Record<string, any>): Promise<string> {
        const clean = await this.filterCols(table, row);
        const [existing] = await this.qr.query(
            `SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`, [clean.id],
        );
        if (existing) {
            // Un uuid no colisiona por accidente → es la misma fila
            this.lastAction = 'reused';
            this.bump('reused', table);
            return clean.id;
        }
        await this.rawInsert(table, clean);
        this.lastAction = 'inserted';
        this.bump('inserted', table);
        return clean.id;
    }

    // ── Pivotes con PK compuesta (INSERT IGNORE = idempotente) ────────────────

    async insertPivot(table: string, row: Record<string, any>): Promise<void> {
        const clean = await this.filterCols(table, row);
        const cols = Object.keys(clean).filter((k) => clean[k] !== undefined);
        const result = await this.qr.query(
            `INSERT IGNORE INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')})
       VALUES (${cols.map(() => '?').join(', ')})`,
            cols.map((c) => clean[c]),
        );
        if ((result as any)?.affectedRows === 0) this.bump('reused', table);
        else this.bump('inserted', table);
    }

    // ── Validación de usuarios (catálogo que no se copia) ─────────────────────

    async userExists(userId: number): Promise<boolean> {
        if (userId == null) return false;
        if (this.userCache.has(userId)) return this.userCache.get(userId)!;
        const [u] = await this.qr.query('SELECT id FROM `users` WHERE id = ? LIMIT 1', [userId]);
        this.userCache.set(userId, !!u);
        return !!u;
    }

    /** Si la columna "autor" apunta a un usuario inexistente → NULL (no perder la fila). */
    async nullifyMissingUser(table: string, row: Record<string, any>, col: string): Promise<Record<string, any>> {
        if (row[col] == null) return row;
        if (await this.userExists(row[col])) return row;
        this.report.warnings.push(`${table} id=${row.id}: ${col}=${row[col]} no existe → NULL`);
        return { ...row, [col]: null };
    }

    skip(table: string, reason: string) {
        this.report.skipped.push(`${table}: ${reason}`);
        this.totalSkipped++;
    }

    bump(bucket: 'inserted' | 'remapped' | 'reused', table: string) {
        this.report[bucket][table] = (this.report[bucket][table] ?? 0) + 1;
        this.rowsProcessed++;
        if (bucket === 'inserted') this.totalInserted++;
        else if (bucket === 'remapped') this.totalRemapped++;
        else this.totalReused++;

        if (this.rowsProcessed % this.ROWS_LOG_EVERY === 0) {
            this.logger.log(
                `[club ${this.clubId}]   ... ${this.rowsProcessed} filas procesadas ` +
                `(insertadas=${this.totalInserted} reusadas=${this.totalReused} remapeadas=${this.totalRemapped} saltadas=${this.totalSkipped}) — última tabla: ${table}`,
            );
        }
    }

    // ── Internos ──────────────────────────────────────────────────────────────

    private async rawInsert(table: string, row: Record<string, any>): Promise<number> {
        const cols = Object.keys(row).filter((k) => row[k] !== undefined);
        const result = await this.qr.query(
            `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')})
       VALUES (${cols.map(() => '?').join(', ')})`,
            cols.map((c) => row[c]),
        );
        return Number((result as any)?.insertId ?? row.id ?? 0);
    }

    /**
     * Intersección de columnas: descarta las que el backup tiene y producción
     * no (esquema pudo cambiar en estos días). Se reporta una vez por tabla.
     */
    private async filterCols(table: string, row: Record<string, any>): Promise<Record<string, any>> {
        let cols = this.prodColsCache.get(table);
        if (!cols) {
            const rows = await this.qr.query(
                `SELECT COLUMN_NAME cn, IS_NULLABLE nullable, DATA_TYPE dt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
                [table],
            );
            cols = new Map(
                rows.map((r: any) => [r.cn, { nullable: r.nullable === 'YES', dataType: r.dt }]),
            );
            this.prodColsCache.set(table, cols);
        }

        const clean: Record<string, any> = {};
        const dropped: string[] = [];
        let zeroDatesFound = false;

        for (const k of Object.keys(row)) {
            const meta = cols.get(k);
            if (!meta) { dropped.push(k); continue; }

            const isZeroDate = typeof row[k] === 'string' && /^0000-00-00/.test(row[k]);
            if (!isZeroDate) { clean[k] = row[k]; continue; }

            zeroDatesFound = true;
            if (meta.nullable) {
                clean[k] = null;
            } else {
                // NOT NULL → no se puede dejar en NULL; se usa un placeholder
                // real y válido en vez de perder la fila entera.
                clean[k] = meta.dataType === 'date' ? '1970-01-01' : '1970-01-01 00:00:00';
            }
        }

        if (dropped.length && !this.report.droppedColumns[table]) {
            this.report.droppedColumns[table] = dropped;
        }
        if (zeroDatesFound) {
            this.report.warnings.push(
                `${table}: fecha inválida '0000-00-00...' saneada (NULL si la columna lo permite, 1970-01-01 si es NOT NULL)`,
            );
        }
        return clean;
    }

    /**
     * ¿La fila que ya existe en prod es LA MISMA que la del backup?
     * Heurística: created_at idéntico (y updated_at si ambos existen).
     * Con dateStrings el backup da strings; prod puede dar Date → normalizar.
     */
    private looksSame(prodRow: Record<string, any>, backupRow: Record<string, any>): boolean {
        const norm = (v: any) => (v == null ? null : new Date(v).getTime());
        const pc = norm(prodRow.created_at);
        const bc = norm(backupRow.created_at);
        if (pc != null && bc != null) return pc === bc;
        // Sin created_at comparable → asumir que es OTRA fila (más seguro:
        // genera registro nuevo en vez de mezclar datos ajenos).
        return false;
    }
}