/**
 * ══════════════════════════════════════════════════════════════════════
 *  RESTORES · Registro central de entidades
 * ══════════════════════════════════════════════════════════════════════
 * RESTORE_ENTITIES se registra en DOS lados:
 *
 *   a) Conexión default (producción) → TypeOrmModule.forFeature(RESTORE_ENTITIES)
 *      en RestoresModule.
 *   b) DataSource dinámico del BACKUP, creado en runtime:
 *        new DataSource({ ..., entities: RESTORE_ENTITIES, synchronize: false,
 *                         extra: { dateStrings: true } })
 *
 * ─────────────────────────────────────────────────────────────────────
 * ORDEN DE INSERCIÓN (FK-safe, lo respeta el RestoresService):
 *
 *  1. clubs, club_translations
 *  2. secction_clubs (si falta) / detail_section_clubs / detail_user_sections_clubs
 *  3. club_user / hosts / permisos / viewers / filter_values
 *  4. advertisements+lang, tasks+lang, tabs+lang            (antes de juegos y videorooms)
 *  5. Juegos: alphabet_soups, complete_sentences, crosswords, drag_drops,
 *     hanging_games, memory_games, time_sequences + sus hijos (words_hints,
 *     words__image__drag_drops, phrases_words, sequences)   (antes de videorooms:
 *     detail_video_room_activitaties los referencia vía id_activities/type)
 *  6. evaluations → árbol → evaluation_clubs
 *  7. folders/events/categories → contents+lang+embed+images+category+scorms
 *  8. videorooms → videoroom_content, detalles, selft_evaluations
 *  9. Progreso: general_pogress_video_rooms, user_pogress_video_rooms,
 *     user_pogress_task_videorooms, user_pogress_forum_videorooms,
 *     user_pogress_video_room_activities, user_pogress_evaluation_video_rooms,
 *     user_pogress_selft_evaluation_videorroms, pogress_scorm_users
 * 10. Intentos de usuario en juegos: alphabet_soup_users, complete_sentences_users
 *     + history, words_hints ya cubierto, hanging_game_users, memory_game_users,
 *     time_sequence_users
 * 11. Datos de evaluación de usuario: evaluation_users, evaluation_history,
 *     answers, additional_question_answers, user_visit_contents,
 *     attachment_tasks, comments+pivotes, user_certificates
 * 12. thread_club / progress_report_clubs
 *
 * Reglas del service (todas las tablas): insert idempotente vía CopyEngine
 * (mismo id + mismo created_at → reuse; id ocupado por otra fila → remap),
 * IDs originales cuando no hay colisión, catálogos (users/clients/langs/
 * roles/permissions/content_type) NO se copian, solo se validan.
 */
import {
    Club, ClubUser, HostsClubDetailem, PermissionClub, ClubViewer,
    SecctionClubs, DetailSectionClub, DetailUserSectionsClub, ClubFilter,
    ClubFilterValue, UserCertificate, ThreadClub, ProgressReportClub,
} from './club-core.entities';
import {
    ContentType, LangContentType, Content, LangContent, Images, ContentImage,
    LangImage, ContentEmbed, Folder, Event, Category, ContentCategory,
    CommentContent, UserVisitContents, Scorm,
} from './content.entities';
import {
    Evaluation, EvaluationClub, Question, Options, QuestionCondition, Answers,
    AdditionalQuestion, AdditionalQuestionOptions, AdditionalQuestionAnswer,
    EvaluationUser, EvaluationHistory, Certificate,
} from './evaluation.entities';
import {
    VideoRoom, VideoRoomContent, DetailEvaluationVideoRoom,
    DetailVideoRoomActivitaties, DetailTasksVideoroom, DetailWallsVideoRoom,
    DetailUsersPrivateVideorrom, SelftEvaluation, QuestionsSelftEvaluation,
    OptionsSelfEvaluation, DetailSelftEvaluationVideoroom,
} from './videoroom.entities';
import {
    Advertisenment, LangAdvertisenments, Task, LangTask, AttachmentTask, Tab,
    LangTabs, Comment, AnswerComment, ReactionsComments, CommentAdvertisement,
    CommentTask,
} from './social.entities';
import {
    GeneralPogressVideoRoom, UserPogressVideoRoom, UserPogressTaskVideoroom,
    UserPogressForumVideoroom, UserPogressVideoRoomActivity,
    UserPogressEvaluationVideoRoom, UserPogressSelftEvaluationVideorrom,
    PogressScormUser, ClubTranslation,
} from './progress.entities';
import {
    AlphabetSoup, AlphabetSoupUsers, CompleteSentences, CompleteSentencesUser,
    CompleteSentencesHistoryUsers, Crossword, WordsHints, DragDrop,
    WordsImageDragDrop, HangingGame, PhraseWord, HangingGameUsers, MemoryGame,
    MemoryGameUsers, TimeSequence, Sequences, TimeSequenceUsers,
} from './games.entities';

export * from './club-core.entities';
export * from './content.entities';
export * from './evaluation.entities';
export * from './videoroom.entities';
export * from './social.entities';
export * from './progress.entities';
export * from './games.entities';

export const RESTORE_ENTITIES = [
    // Núcleo del club
    Club, ClubUser, HostsClubDetailem, PermissionClub, ClubViewer,
    SecctionClubs, DetailSectionClub, DetailUserSectionsClub, ClubFilter,
    ClubFilterValue, UserCertificate, ThreadClub, ProgressReportClub,
    ClubTranslation,
    // Contenidos
    ContentType, LangContentType, Content, LangContent, Images, ContentImage,
    LangImage, ContentEmbed, Folder, Event, Category, ContentCategory,
    CommentContent, UserVisitContents, Scorm,
    // Evaluaciones
    Evaluation, EvaluationClub, Question, Options, QuestionCondition, Answers,
    AdditionalQuestion, AdditionalQuestionOptions, AdditionalQuestionAnswer,
    EvaluationUser, EvaluationHistory, Certificate,
    // Videorooms
    VideoRoom, VideoRoomContent, DetailEvaluationVideoRoom,
    DetailVideoRoomActivitaties, DetailTasksVideoroom, DetailWallsVideoRoom,
    DetailUsersPrivateVideorrom, SelftEvaluation, QuestionsSelftEvaluation,
    OptionsSelfEvaluation, DetailSelftEvaluationVideoroom,
    // Muros, tareas, tabs, comentarios
    Advertisenment, LangAdvertisenments, Task, LangTask, AttachmentTask, Tab,
    LangTabs, Comment, AnswerComment, ReactionsComments, CommentAdvertisement,
    CommentTask,
    // Progreso de usuario en videorooms
    GeneralPogressVideoRoom, UserPogressVideoRoom, UserPogressTaskVideoroom,
    UserPogressForumVideoroom, UserPogressVideoRoomActivity,
    UserPogressEvaluationVideoRoom, UserPogressSelftEvaluationVideorrom,
    PogressScormUser,
    // Mini-juegos
    AlphabetSoup, AlphabetSoupUsers, CompleteSentences, CompleteSentencesUser,
    CompleteSentencesHistoryUsers, Crossword, WordsHints, DragDrop,
    WordsImageDragDrop, HangingGame, PhraseWord, HangingGameUsers, MemoryGame,
    MemoryGameUsers, TimeSequence, Sequences, TimeSequenceUsers,
];