import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Connection, DataSource } from "typeorm";

export type UserScope = number[] | { sql: string; params: any[] } | null;

export interface GeneralIndicatorsParams {
  clientId: number;
  clubIds: number[];
  /** 'YYYY-MM-DD HH:mm:ss' (Carbon->toDateTimeString()) o Date */
  startDate: string | Date;
  endDate: string | Date;
  totalUsers: number;
  activeUsers: number;
  userScope?: UserScope;
}

export interface GeneralIndicators {
  total_users: number;
  active_users: number;
  enrollments_in_period: number;
  users_started_in_period: number;
  completions_in_period: number;
  users_completed_in_period: number;
  certificates_hours: number;
  avg_score: number | null;
  completion_rate: number;
  total_enrollments: number;
}

export interface UserRankingParams {
  clientId: number;
  clubIds: number[];
  startDate: string | Date;
  endDate: string | Date;
  /** Tamaño del ranking (default 10) */
  limit?: number;
  userScope?: UserScope;
}

export interface UserRankingRow {
  user_id: number;
  name: string;
  email: string;
  company: string;
  identification: string;
  completados: number;
  nota_promedio: number | null;
  ultima_actividad: string; // 'dd/mm/yyyy' o '-'
}

export interface CourseStatsParams {
  clubIds: number[];
  startDate: string | Date;
  endDate: string | Date;
  /** Tamaño del top (default 10) */
  limit?: number;
  userScope?: UserScope;
}

export interface CourseStatsRow {
  club_id: number;
  title: string;
  enrolled: number;
  enrolled_in_period: number;
  completed: number;
  completion_rate: number;
}

export interface TimelineParams {
  clubIds: number[];
  startDate: string | Date;
  endDate: string | Date;
  userScope?: UserScope;
}

export interface CompletionsTimeline {
  labels: string[];      // 'dd/mm'
  completions: number[]; // intentos aprobados por día
  enrollments: number[]; // inscripciones por día
}

export interface ProgressDistributionParams {
  clubIds: number[];
  /** Máximo de usuarios muestreados (default 200) */
  cap?: number;
  userScope?: UserScope;
}

export type ProgressBuckets = {
  '0-24': number;
  '25-49': number;
  '50-74': number;
  '75-99': number;
  '100': number;
};

export interface ProgressDistribution {
  buckets: ProgressBuckets;
  sampled_users: number;
  is_sample: boolean;
}

@Injectable()
export class MetricGeneralService {
  private readonly logger = new Logger(MetricGeneralService.name);

  constructor(
    private connection: Connection,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) { }

  async getGeneralIndicators(params: GeneralIndicatorsParams): Promise<GeneralIndicators> {
    const { clientId, clubIds, startDate, endDate, totalUsers, activeUsers } = params;
    const userScope = params.userScope ?? null;

    const empty: GeneralIndicators = {
      total_users: totalUsers,
      active_users: activeUsers,
      enrollments_in_period: 0,
      users_started_in_period: 0,
      completions_in_period: 0,
      users_completed_in_period: 0,
      certificates_hours: 0,
      avg_score: null,
      completion_rate: 0,
      total_enrollments: 0,
    };

    // Sin cursos, o filtros de usuario que no coincidieron con nadie → todo en cero
    if (!clubIds || clubIds.length === 0) return empty;
    if (Array.isArray(userScope) && userScope.length === 0) return empty;

    const clubIn = this.inList(clubIds.length);

    // Scope de usuario para cada tabla (columna distinta según alias)
    const scopeCU = this.resolveUserScope(userScope, 'user_id');    // club_user
    const scopeEU = this.resolveUserScope(userScope, 'eu.user_id'); // evaluation_users

    // Subquery: evaluaciones certificables asociadas a estos cursos
    const certifiableEvalsSql = this.certifiableEvaluationsSql(clubIn);

    // ---- Q1: actividad del periodo sobre club_user ----
    const periodActivitySql = `
      SELECT
        COUNT(*)                AS enrollments_in_period,
        COUNT(DISTINCT user_id) AS users_started_in_period
      FROM club_user
      WHERE club_id IN (${clubIn})
        AND created_at BETWEEN ? AND ?
        ${scopeCU.sql}`;
    const periodActivityParams = [...clubIds, startDate, endDate, ...scopeCU.params];

    // ---- Q2: inscripciones históricas totales ----
    const totalEnrollmentsSql = `
      SELECT COUNT(*) AS total_enrollments
      FROM club_user
      WHERE club_id IN (${clubIn})
        ${scopeCU.sql}`;
    const totalEnrollmentsParams = [...clubIds, ...scopeCU.params];

    // ---- Q3: aprobados en el periodo (conteos + promedio de nota) ----
    const approvedStatsSql = `
      SELECT
        COUNT(*)                   AS completions_in_period,
        COUNT(DISTINCT eu.user_id) AS users_completed_in_period,
        AVG(eu.nota)               AS avg_score
      FROM evaluation_users eu
      INNER JOIN users u ON u.id = eu.user_id AND u.client_id = ?
      WHERE eu.approved = 1
        AND eu.updated_at BETWEEN ? AND ?
        AND eu.evaluation_id IN (${certifiableEvalsSql})
        ${scopeEU.sql}`;
    const approvedStatsParams = [clientId, startDate, endDate, ...clubIds, ...scopeEU.params];

    // ---- Q4: horas certificadas emitidas (aprobados × horas del certificado) ----
    const certificateHoursSql = `
      SELECT COALESCE(SUM(c.hours), 0) AS certificates_hours
      FROM evaluation_users eu
      INNER JOIN users u ON u.id = eu.user_id AND u.client_id = ?
      INNER JOIN certificates c ON c.evaluation_id = eu.evaluation_id
      WHERE eu.approved = 1
        AND eu.updated_at BETWEEN ? AND ?
        AND eu.evaluation_id IN (${certifiableEvalsSql})
        ${scopeEU.sql}`;
    const certificateHoursParams = [clientId, startDate, endDate, ...clubIds, ...scopeEU.params];

    try {
      const [periodRows, totalRows, approvedRows, hoursRows] = await Promise.all([
        this.connection.query(periodActivitySql, periodActivityParams),
        this.connection.query(totalEnrollmentsSql, totalEnrollmentsParams),
        this.connection.query(approvedStatsSql, approvedStatsParams),
        this.connection.query(certificateHoursSql, certificateHoursParams),
      ]);

      const period = periodRows[0] ?? {};
      const approved = approvedRows[0] ?? {};

      const usersStarted = Number(period.users_started_in_period ?? 0);
      const usersCompleted = Number(approved.users_completed_in_period ?? 0);
      const avgScoreRaw = approved.avg_score;

      return {
        total_users: totalUsers,
        active_users: activeUsers,
        enrollments_in_period: Number(period.enrollments_in_period ?? 0),
        users_started_in_period: usersStarted,
        completions_in_period: Number(approved.completions_in_period ?? 0),
        users_completed_in_period: usersCompleted,
        certificates_hours: this.round1(Number(hoursRows[0]?.certificates_hours ?? 0)),
        avg_score: avgScoreRaw !== null && avgScoreRaw !== undefined
          ? this.round1(Number(avgScoreRaw))
          : null,
        // Tasa de finalización del periodo: completaron / iniciaron
        completion_rate: usersStarted > 0
          ? this.round1((usersCompleted / usersStarted) * 100)
          : 0,
        total_enrollments: Number(totalRows[0]?.total_enrollments ?? 0),
      };
    } catch (error) {
      this.logger.error(`getGeneralIndicators falló: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserCompletionRanking(params: UserRankingParams): Promise<UserRankingRow[]> {
    const { clientId, clubIds, startDate, endDate } = params;
    const userScope = params.userScope ?? null;
    // LIMIT saneado e inlineado (entero controlado, no viaja como placeholder)
    const limit = Math.max(1, Math.trunc(Number(params.limit) || 10));

    if (!clubIds || clubIds.length === 0) return [];
    if (Array.isArray(userScope) && userScope.length === 0) return [];

    const clubIn = this.inList(clubIds.length);
    const scopeEU = this.resolveUserScope(userScope, 'eu.user_id');

    // Las columnas de users van en el GROUP BY para ser compatibles con
    // ONLY_FULL_GROUP_BY (dependen funcionalmente de user_id, mismo resultado).
    const sql = `
      SELECT
        eu.user_id,
        u.name,
        u.last_name,
        u.email,
        u.company,
        u.identification,
        COUNT(DISTINCT eu.evaluation_id) AS completados,
        ROUND(AVG(eu.nota), 1)           AS nota_promedio,
        MAX(eu.updated_at)               AS ultima_actividad
      FROM evaluation_users eu
      INNER JOIN users u ON u.id = eu.user_id AND u.client_id = ?
      WHERE eu.approved = 1
        AND eu.updated_at BETWEEN ? AND ?
        AND eu.evaluation_id IN (${this.certifiableEvaluationsSql(clubIn)})
        ${scopeEU.sql}
      GROUP BY eu.user_id, u.name, u.last_name, u.email, u.company, u.identification
      ORDER BY completados DESC, nota_promedio DESC
      LIMIT ${limit}`;

    const sqlParams = [clientId, startDate, endDate, ...clubIds, ...scopeEU.params];

    try {
      const rows: any[] = await this.connection.query(sql, sqlParams);

      return rows.map((row): UserRankingRow => {
        const fullName = `${row.name ?? ''} ${row.last_name ?? ''}`.trim();

        return {
          user_id: Number(row.user_id),
          name: fullName !== '' ? fullName : `Usuario #${row.user_id}`,
          email: row.email ?? '',
          company: row.company ?? '',
          identification: row.identification ?? '',
          completados: Number(row.completados ?? 0),
          nota_promedio: row.nota_promedio !== null && row.nota_promedio !== undefined
            ? Number(row.nota_promedio)
            : null,
          ultima_actividad: this.formatDateDmy(row.ultima_actividad),
        };
      });
    } catch (error) {
      this.logger.error(`getUserCompletionRanking falló: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCourseCompletionStats(params: CourseStatsParams): Promise<CourseStatsRow[]> {
    const { clubIds, startDate, endDate } = params;
    const userScope = params.userScope ?? null;
    const limit = Math.max(1, Math.trunc(Number(params.limit) || 10));

    if (!clubIds || clubIds.length === 0) return [];

    // Filtros de usuario sin coincidencias: se omiten los agregados
    // (todo queda en cero) pero igual se resuelven los títulos.
    const noUserMatches = Array.isArray(userScope) && userScope.length === 0;
    const effectiveScope = noUserMatches ? null : userScope;

    const clubIn = this.inList(clubIds.length);
    const scopeCU = this.resolveUserScope(effectiveScope, 'user_id');
    const scopeEU = this.resolveUserScope(effectiveScope, 'eu.user_id');

    // ---- Q1: inscritos totales por curso ----
    const enrolledSql = `
      SELECT club_id, COUNT(DISTINCT user_id) AS total
      FROM club_user
      WHERE club_id IN (${clubIn})
        ${scopeCU.sql}
      GROUP BY club_id`;
    const enrolledParams = [...clubIds, ...scopeCU.params];

    // ---- Q2: inscritos en el periodo por curso ----
    const enrolledPeriodSql = `
      SELECT club_id, COUNT(DISTINCT user_id) AS total
      FROM club_user
      WHERE club_id IN (${clubIn})
        AND created_at BETWEEN ? AND ?
        ${scopeCU.sql}
      GROUP BY club_id`;
    const enrolledPeriodParams = [...clubIds, startDate, endDate, ...scopeCU.params];

    // ---- Q3: completados por curso en el periodo ----
    const completedSql = `
      SELECT ec.club_id, SUM(x.total) AS total
      FROM (
        SELECT eu.evaluation_id, COUNT(DISTINCT eu.user_id) AS total
        FROM evaluation_users eu
        WHERE eu.approved = 1
          AND eu.updated_at BETWEEN ? AND ?
          AND eu.evaluation_id IN (${this.certifiableEvaluationsSql(clubIn)})
          ${scopeEU.sql}
        GROUP BY eu.evaluation_id
      ) x
      INNER JOIN evaluation_clubs ec ON ec.evaluation_id = x.evaluation_id
      WHERE ec.club_id IN (${clubIn})
      GROUP BY ec.club_id`;
    const completedParams = [startDate, endDate, ...clubIds, ...scopeEU.params, ...clubIds];

    // ---- Q4: títulos de los cursos ----
    const titlesSql = `
      SELECT
        c.id AS club_id,
        (
          SELECT ct.title
          FROM club_translations ct
          WHERE ct.club_id = c.id
          ORDER BY ct.id ASC
          LIMIT 1
        ) AS title
      FROM clubs c
      WHERE c.id IN (${clubIn})`;

    try {
      const [titleRows, enrolledRows, enrolledPeriodRows, completedRows]: any[][] = await Promise.all([
        this.connection.query(titlesSql, [...clubIds]),
        noUserMatches ? Promise.resolve([]) : this.connection.query(enrolledSql, enrolledParams),
        noUserMatches ? Promise.resolve([]) : this.connection.query(enrolledPeriodSql, enrolledPeriodParams),
        noUserMatches ? Promise.resolve([]) : this.connection.query(completedSql, completedParams),
      ]);

      const titlesByClub = new Map<number, string | null>(
        titleRows.map((r: any) => [Number(r.club_id), r.title ?? null]),
      );
      const enrolledByClub = this.totalsByKey(enrolledRows, 'club_id');
      const enrolledPeriodByClub = this.totalsByKey(enrolledPeriodRows, 'club_id');
      const completedByClub = this.totalsByKey(completedRows, 'club_id');

      const stats: CourseStatsRow[] = clubIds.map((clubId) => {
        const enrolled = enrolledByClub.get(clubId) ?? 0;
        const completed = completedByClub.get(clubId) ?? 0;

        return {
          club_id: clubId,
          title: titlesByClub.get(clubId) ?? `Curso #${clubId}`,
          enrolled,
          enrolled_in_period: enrolledPeriodByClub.get(clubId) ?? 0,
          completed,
          completion_rate: enrolled > 0 ? this.round1((completed / enrolled) * 100) : 0,
        };
      });
      return stats.sort((a, b) => b.completed - a.completed).slice(0, limit);
    } catch (error) {
      this.logger.error(`getCourseCompletionStats falló: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCompletionsTimeline(params: TimelineParams): Promise<CompletionsTimeline> {
    const { clubIds, startDate, endDate } = params;
    const userScope = params.userScope ?? null;

    if (!clubIds || clubIds.length === 0) {
      return { labels: [], completions: [], enrollments: [] };
    }

    const noUserMatches = Array.isArray(userScope) && userScope.length === 0;
    const effectiveScope = noUserMatches ? null : userScope;

    const clubIn = this.inList(clubIds.length);
    const scopeCU = this.resolveUserScope(effectiveScope, 'user_id');
    const scopeEU = this.resolveUserScope(effectiveScope, 'eu.user_id');

    // ---- Q1: aprobados por día ----
    const completionsSql = `
      SELECT DATE(eu.updated_at) AS dia, COUNT(*) AS total
      FROM evaluation_users eu
      WHERE eu.approved = 1
        AND eu.updated_at BETWEEN ? AND ?
        AND eu.evaluation_id IN (${this.certifiableEvaluationsSql(clubIn)})
        ${scopeEU.sql}
      GROUP BY DATE(eu.updated_at)`;
    const completionsParams = [startDate, endDate, ...clubIds, ...scopeEU.params];

    // ---- Q2: inscripciones por día ----
    const enrollmentsSql = `
      SELECT DATE(created_at) AS dia, COUNT(*) AS total
      FROM club_user
      WHERE club_id IN (${clubIn})
        AND created_at BETWEEN ? AND ?
        ${scopeCU.sql}
      GROUP BY DATE(created_at)`;
    const enrollmentsParams = [...clubIds, startDate, endDate, ...scopeCU.params];

    try {
      const [completionRows, enrollmentRows]: any[][] = await Promise.all([
        noUserMatches ? Promise.resolve([]) : this.connection.query(completionsSql, completionsParams),
        noUserMatches ? Promise.resolve([]) : this.connection.query(enrollmentsSql, enrollmentsParams),
      ]);

      const completionsByDay = this.totalsByDay(completionRows);
      const enrollmentsByDay = this.totalsByDay(enrollmentRows);

      const startKey = this.toYmdKey(startDate);
      const endKey = this.toYmdKey(endDate);

      const labels: string[] = [];
      const completions: number[] = [];
      const enrollments: number[] = [];

      if (startKey && endKey) {
        // Cursor en UTC mediodía para esquivar saltos de hora (DST)
        let cursor = new Date(`${startKey}T12:00:00Z`);

        while (true) {
          const key = cursor.toISOString().slice(0, 10);
          if (key > endKey) break;

          labels.push(`${key.slice(8, 10)}/${key.slice(5, 7)}`); // 'dd/mm'
          completions.push(completionsByDay.get(key) ?? 0);
          enrollments.push(enrollmentsByDay.get(key) ?? 0);

          cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        }
      }

      return { labels, completions, enrollments };
    } catch (error) {
      this.logger.error(`getCompletionsTimeline falló: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getProgressDistribution(params: ProgressDistributionParams): Promise<ProgressDistribution> {
    const { clubIds } = params;
    const userScope = params.userScope ?? null;
    const cap = Math.max(1, Math.trunc(Number(params.cap) || 200));

    const base: ProgressDistribution = {
      buckets: { '0-24': 0, '25-49': 0, '50-74': 0, '75-99': 0, '100': 0 },
      sampled_users: 0,
      is_sample: false,
    };

    if (!clubIds || clubIds.length === 0) return base;
    if (Array.isArray(userScope) && userScope.length === 0) return base;

    const clubIn = this.inList(clubIds.length);
    const scopeCU = this.resolveUserScope(userScope, 'user_id');

    // ---- Q1: total de inscritos distintos (para sampled_users / is_sample) ----
    const enrolledCountSql = `
      SELECT COUNT(DISTINCT user_id) AS total
      FROM club_user
      WHERE club_id IN (${clubIn})
        ${scopeCU.sql}`;
    const enrolledCountParams = [...clubIds, ...scopeCU.params];

    // ---- Q2: buckets en una sola pasada ----
    //   su = muestra de usuarios inscritos (LIMIT cap)
    //   vc = cursos con videorooms calificables y su conteo
    //   p  = Σ porcen por (usuario, curso) sobre esos videorooms
    const bucketsSql = `
      SELECT
        CASE
          WHEN t.pct >= 100 THEN '100'
          WHEN t.pct >= 75  THEN '75-99'
          WHEN t.pct >= 50  THEN '50-74'
          WHEN t.pct >= 25  THEN '25-49'
          ELSE '0-24'
        END AS bucket,
        COUNT(*) AS total
      FROM (
        SELECT
          LEAST(100, GREATEST(0, FLOOR(COALESCE(p.suma, 0) / vc.vr_count))) AS pct
        FROM (
          SELECT DISTINCT user_id
          FROM club_user
          WHERE club_id IN (${clubIn})
            ${scopeCU.sql}
          ORDER BY user_id
          LIMIT ${cap}
        ) su
        CROSS JOIN (
          SELECT vr.club_id, COUNT(*) AS vr_count
          FROM video_rooms vr
          WHERE vr.club_id IN (${clubIn})
            AND vr.enable_modules = 1
            AND vr.public = 1
          GROUP BY vr.club_id
        ) vc
        LEFT JOIN (
          SELECT g.id_user, v.club_id, SUM(g.porcen) AS suma
          FROM general_pogress_video_rooms g
          INNER JOIN video_rooms v ON v.id = g.id_videoroom
          WHERE v.club_id IN (${clubIn})
            AND v.enable_modules = 1
            AND v.public = 1
          GROUP BY g.id_user, v.club_id
        ) p ON p.id_user = su.user_id AND p.club_id = vc.club_id
      ) t
      GROUP BY bucket`;
    // clubIds aparece 3 veces: muestra (su), conteo de videorooms (vc) y suma de porcen (p)
    const bucketsParams = [...clubIds, ...scopeCU.params, ...clubIds, ...clubIds];

    try {
      const [countRows, bucketRows]: any[][] = await Promise.all([
        this.connection.query(enrolledCountSql, enrolledCountParams),
        this.connection.query(bucketsSql, bucketsParams),
      ]);

      const totalEnrolled = Number(countRows[0]?.total ?? 0);

      for (const row of bucketRows) {
        const key = String(row.bucket) as keyof ProgressBuckets;
        if (key in base.buckets) {
          base.buckets[key] = Number(row.total ?? 0);
        }
      }

      base.sampled_users = Math.min(totalEnrolled, cap);
      base.is_sample = totalEnrolled > cap;

      return base;
    } catch (error) {
      this.logger.error(`getProgressDistribution falló: ${error.message}`, error.stack);
      throw error;
    }
  }

  async resolveClientClubIds(clientId: number, requestedClubIds?: number[] | null): Promise<number[]> {
    const requested = (requestedClubIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
    const hasRequest = requested.length > 0;

    const sql = `
      SELECT id
      FROM clubs
      WHERE client_id = ?
        ${hasRequest ? `AND id IN (${this.inList(requested.length)})` : ''}
      ORDER BY id`;

    const rows: any[] = await this.connection.query(
      sql,
      hasRequest ? [clientId, ...requested] : [clientId],
    );

    return rows.map((r) => Number(r.id));
  }

  async getUserCounts(
    clientId: number,
    userScope: UserScope = null,
  ): Promise<{ total: number; active: number }> {
    if (Array.isArray(userScope) && userScope.length === 0) {
      return { total: 0, active: 0 };
    }

    const scope = this.resolveUserScope(userScope, 'id');
    const sql = `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(status_validation = 1), 0) AS active
      FROM users
      WHERE client_id = ?
        ${scope.sql}`;

    const rows: any[] = await this.connection.query(sql, [clientId, ...scope.params]);

    return {
      total: Number(rows[0]?.total ?? 0),
      active: Number(rows[0]?.active ?? 0),
    };
  }

  // ============================ Helpers ============================

  /** "?, ?, ?" para cláusulas IN */
  private inList(count: number): string {
    return Array(count).fill('?').join(', ');
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private resolveUserScope(scope: UserScope, column: string): { sql: string; params: any[] } {
    if (!scope) {
      return { sql: '', params: [] };
    }
    if (Array.isArray(scope)) {
      return {
        sql: `AND ${column} IN (${this.inList(scope.length)})`,
        params: scope,
      };
    }
    return {
      sql: `AND ${column} IN (${scope.sql})`,
      params: scope.params,
    };
  }

  private certifiableEvaluationsSql(clubIn: string): string {
    return `
      SELECT ec.evaluation_id
      FROM evaluation_clubs ec
      INNER JOIN evaluations e ON e.id = ec.evaluation_id
      WHERE e.enable_certificate = 1
        AND ec.club_id IN (${clubIn})`;
  }

  private formatDateDmy(value: Date | string | null | undefined): string {
    const key = this.toYmdKey(value);
    return key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '-';
  }

  private toYmdKey(value: Date | string | null | undefined): string | null {
    if (!value) return null;

    if (value instanceof Date) {
      const mm = String(value.getMonth() + 1).padStart(2, '0');
      const dd = String(value.getDate()).padStart(2, '0');
      return `${value.getFullYear()}-${mm}-${dd}`;
    }

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }

  private totalsByKey(rows: any[], key: string): Map<number, number> {
    const map = new Map<number, number>();
    for (const row of rows ?? []) {
      map.set(Number(row[key]), Number(row.total ?? 0));
    }
    return map;
  }

  private totalsByDay(rows: any[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = this.toYmdKey(row.dia);
      if (key) {
        map.set(key, Number(row.total ?? 0));
      }
    }
    return map;
  }
}