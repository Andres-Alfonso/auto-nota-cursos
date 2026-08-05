/**
 * ══════════════════════════════════════════════════════════════════════
 *  RESTORES · Registro central de entidades
 * ══════════════════════════════════════════════════════════════════════
 * RESTORE_ENTITIES se registra en DOS lados:
 *
 *   a) Conexión default (producción) → TypeOrmModule.forFeature(RESTORE_ENTITIES)
 *      en RestoresModule.
 *
 *   b) DataSource dinámico del BACKUP, creado en runtime con las credenciales
 *      que llegan en el request:
 *
 *        const backupDs = new DataSource({
 *          type: 'mysql',
 *          host, port, username, password, database,   // ← del backup
 *          entities: RESTORE_ENTITIES,
 *          synchronize: false,
 *          extra: { dateStrings: true }, // fechas como string → copia literal, sin líos de timezone
 *        });
 *        await backupDs.initialize();
 *
 * ─────────────────────────────────────────────────────────────────────
 * ORDEN DE INSERCIÓN SUGERIDO (FK-safe, lo respeta el RestoresService):
 *
 *  1. clubs                                  → la raíz
 *  2. club_translations                      → PENDIENTE (reusar entity existente)
 *  3. secction_clubs (solo si falta), detail_section_clubs, detail_user_sections_clubs
 *  4. club_user, hosts_club_detailems, club_permission, club_viewer, club_filter_values
 *  5. folders, events, categories            → uuid, padres de contents
 *  6. tasks + lang_task, advertisements + lang_advertisenments, tabs + lang_tabs
 *  7. evaluations → questions → options → question_conditions,
 *     additional_questions → additional_question_options, certificates
 *  8. evaluation_clubs
 *  9. contents → lang_contents, content_embed, images + content_images + lang_images,
 *     content_category, scorms
 * 10. videorooms → videoroom_content, detail_evaluation_video_rooms,
 *     detail_video_room_activitaties, detail_tasks_videorooms,
 *     detail_walls_video_rooms, detail_users_private_videorroms,
 *     selft_evaluations → questions_selft_evaluations → options_self_evaluations,
 *     detail_selft_evaluation_videorooms
 * 11. Datos de usuario: evaluation_users, evaluation_history, answers,
 *     additional_question_answers, user_visit_contents, attachment_tasks,
 *     comments → comment_content / comment_task / comment_advertisement →
 *     answer_comments → reactions_comments, user_certificates_resources
 * 12. Progreso: GeneralPogressVideoRoom, PogressScormUser → PENDIENTES
 * 13. thread_club, progress_report_clubs (si aplica)
 *
 * Reglas del service (todas las tablas):
 *  - Insert idempotente (INSERT IGNORE / verificar existencia): evaluaciones,
 *    comments, contents compartidos, etc. pueden seguir vivos en producción.
 *  - Mantener IDs originales + pre-check de colisiones antes de escribir.
 *  - users / clients / langs / roles / permissions / content_type son catálogos:
 *    NO se copian; se valida que las FKs existan (p.ej. saltar club_user de un
 *    usuario que ya no existe).
 */
import {
    Club,
    ClubUser,
    HostsClubDetailem,
    PermissionClub,
    ClubViewer,
    SecctionClubs,
    DetailSectionClub,
    DetailUserSectionsClub,
    ClubFilter,
    ClubFilterValue,
    UserCertificate,
    ThreadClub,
    ProgressReportClub,
} from './club-core.entities';
import {
    ContentType,
    LangContentType,
    Content,
    LangContent,
    Images,
    ContentImage,
    LangImage,
    ContentEmbed,
    Folder,
    Event,
    Category,
    ContentCategory,
    CommentContent,
    UserVisitContents,
    Scorm,
} from './content.entities';
import {
    Evaluation,
    EvaluationClub,
    Question,
    Options,
    QuestionCondition,
    Answers,
    AdditionalQuestion,
    AdditionalQuestionOptions,
    AdditionalQuestionAnswer,
    EvaluationUser,
    EvaluationHistory,
    Certificate,
} from './evaluation.entities';
import {
    VideoRoom,
    VideoRoomContent,
    DetailEvaluationVideoRoom,
    DetailVideoRoomActivitaties,
    DetailTasksVideoroom,
    DetailWallsVideoRoom,
    DetailUsersPrivateVideorrom,
    SelftEvaluation,
    QuestionsSelftEvaluation,
    OptionsSelfEvaluation,
    DetailSelftEvaluationVideoroom,
} from './videoroom.entities';
import {
    Advertisenment,
    LangAdvertisenments,
    Task,
    LangTask,
    AttachmentTask,
    Tab,
    LangTabs,
    Comment,
    AnswerComment,
    ReactionsComments,
    CommentAdvertisement,
    CommentTask,
} from './social.entities';

export * from './club-core.entities';
export * from './content.entities';
export * from './evaluation.entities';
export * from './videoroom.entities';
export * from './social.entities';

export const RESTORE_ENTITIES = [
    // Núcleo del club
    Club,
    ClubUser,
    HostsClubDetailem,
    PermissionClub,
    ClubViewer,
    SecctionClubs,
    DetailSectionClub,
    DetailUserSectionsClub,
    ClubFilter,
    ClubFilterValue,
    UserCertificate,
    ThreadClub,
    ProgressReportClub,
    // Contenidos
    ContentType,
    LangContentType,
    Content,
    LangContent,
    Images,
    ContentImage,
    LangImage,
    ContentEmbed,
    Folder,
    Event,
    Category,
    ContentCategory,
    CommentContent,
    UserVisitContents,
    Scorm,
    // Evaluaciones
    Evaluation,
    EvaluationClub,
    Question,
    Options,
    QuestionCondition,
    Answers,
    AdditionalQuestion,
    AdditionalQuestionOptions,
    AdditionalQuestionAnswer,
    EvaluationUser,
    EvaluationHistory,
    Certificate,
    // Videorooms
    VideoRoom,
    VideoRoomContent,
    DetailEvaluationVideoRoom,
    DetailVideoRoomActivitaties,
    DetailTasksVideoroom,
    DetailWallsVideoRoom,
    DetailUsersPrivateVideorrom,
    SelftEvaluation,
    QuestionsSelftEvaluation,
    OptionsSelfEvaluation,
    DetailSelftEvaluationVideoroom,
    // Muros, tareas, tabs, comentarios
    Advertisenment,
    LangAdvertisenments,
    Task,
    LangTask,
    AttachmentTask,
    Tab,
    LangTabs,
    Comment,
    AnswerComment,
    ReactionsComments,
    CommentAdvertisement,
    CommentTask,
];