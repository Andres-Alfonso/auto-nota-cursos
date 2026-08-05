/**
 * RESTORES · Evaluaciones, encuestas (polls) y todo su árbol.
 * Ver notas de diseño en club-core.entities.ts.
 *
 * OJO: las evaluaciones se enlazan al club vía evaluation_clubs (N:M) y
 * pueden estar COMPARTIDAS con otros clubs que siguen vivos en producción.
 * El service debe hacer insert-si-no-existe fila por fila, nunca asumir
 * que todo el árbol fue borrado.
 */
import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

@Entity({ name: 'evaluations' })
export class Evaluation {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'datetime', nullable: true }) expiration_date: Date | null;
    @Column({ type: 'int', nullable: true }) completion_time: number | null;
    @Column({ type: 'float', nullable: true }) approving_note: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_certificate: number | null;
    @Column({ type: 'varchar', nullable: true }) type: string | null; // 'survey' = encuesta
    @Column({ type: 'varchar', nullable: true }) order_type: string | null;
    @Column({ type: 'varchar', nullable: true }) user_status: string | null;
    @Column({ type: 'tinyint', nullable: true }) status_delete: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_ponderation: number | null;
    @Column({ type: 'tinyint', nullable: true }) ponderation_content_hidden: number | null;
    @Column({ type: 'tinyint', nullable: true }) share_evaluation: number | null;
    @Column({ type: 'varchar', nullable: true }) image: string | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'tinyint', nullable: true }) enable_code_certificate: number | null;
    // typos preservados tal cual existen en la BD:
    @Column({ type: 'tinyint', nullable: true }) eneable_nit_certificate: number | null;
    @Column({ type: 'tinyint', nullable: true }) show_contens_suport: number | null;
    @Column({ type: 'varchar', nullable: true }) location_additional_questions: string | null;
    @Column({ type: 'varchar', nullable: true }) from_category: string | null;
    @Column({ type: 'tinyint', nullable: true }) additional_required_questions: number | null;
    @Column({ type: 'tinyint', nullable: true }) evaluation_to_homologation: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Pivote evaluación ↔ club (withTimestamps). */
@Entity({ name: 'evaluation_clubs' })
export class EvaluationClub {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) evaluation_id: number;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'questions' })
export class Question {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) question: string | null;
    @Column({ type: 'int' }) evaluation_id: number;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'text', nullable: true }) link_support_content: string | null;
    @Column({ type: 'float', nullable: true }) ponderation_content: number | null;
    @Column({ type: 'int', nullable: true }) order: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_unique_choice: number | null;
    @Column({ type: 'varchar', nullable: true }) image_question: string | null;
    // ⚠ VERIFICAR: Question::shouldBeVisible() usa $this->condition_operator
    // → la columna existe aunque no está en el fillable.
    @Column({ type: 'varchar', nullable: true }) condition_operator: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'options' })
export class Options {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) option: string | null;
    @Column({ type: 'tinyint', nullable: true }) correct: number | null;
    @Column({ type: 'int' }) question_id: number;
    @Column({ type: 'text', nullable: true }) data: string | null;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Lógica condicional pregunta-a-pregunta. */
@Entity({ name: 'question_conditions' })
export class QuestionCondition {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) question_id: number;
    @Column({ type: 'int', nullable: true }) trigger_question_id: number | null;
    @Column({ type: 'int', nullable: true }) trigger_option_id: number | null;
    @Column({ type: 'varchar', nullable: true }) operator: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Respuestas de usuarios a preguntas normales. */
@Entity({ name: 'answers' })
export class Answers {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) evaluation_id: number | null;
    @Column({ type: 'int', nullable: true }) question_id: number | null;
    @Column({ type: 'int', nullable: true }) option_id: number | null;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'text', nullable: true }) content: string | null;
    @Column({ type: 'varchar', nullable: true }) verification_code: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'additional_questions' })
export class AdditionalQuestion {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) question: string | null;
    @Column({ type: 'varchar', nullable: true }) question_type: string | null;
    @Column({ type: 'int' }) evaluation_id: number;
    @Column({ type: 'int', nullable: true }) order: number | null;
    @Column({ type: 'tinyint', nullable: true }) enable_unique_choice: number | null;
    @Column({ type: 'varchar', nullable: true }) image_additional_question: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'additional_question_options' })
export class AdditionalQuestionOptions {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'text', nullable: true }) option: string | null;
    @Column({ type: 'int' }) question_id: number;
    @Column({ type: 'text', nullable: true }) data: string | null;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'additional_question_answers' })
export class AdditionalQuestionAnswer {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int', nullable: true }) evaluation_id: number | null;
    @Column({ type: 'int', nullable: true }) additional_question_id: number | null;
    @Column({ type: 'int', nullable: true }) addi_question_option_id: number | null;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'text', nullable: true }) content: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Estado actual del usuario en la evaluación (nota, intentos, código). */
@Entity({ name: 'evaluation_users' })
export class EvaluationUser {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) evaluation_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'float', nullable: true }) nota: number | null;
    @Column({ type: 'tinyint', nullable: true }) approved: number | null;
    @Column({ type: 'varchar', nullable: true }) code: string | null;
    @Column({ type: 'int', nullable: true }) intentos: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Historial de intentos (tabla singular: evaluation_history). */
@Entity({ name: 'evaluation_history' })
export class EvaluationHistory {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) evaluation_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'float', nullable: true }) nota: number | null;
    @Column({ type: 'tinyint', nullable: true }) approved: number | null;
    @Column({ type: 'text', nullable: true }) metadata: string | null; // JSON crudo
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Plantilla del certificado de la evaluación. PK uuid por UsesUuid. */
@Entity({ name: 'certificates' })
export class Certificate {
    @PrimaryColumn({ type: 'char', length: 36 }) id: string;
    @Column({ type: 'int', nullable: true }) evaluation_id: number | null;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'text', nullable: true }) action: string | null;
    @Column({ type: 'text', nullable: true }) reason: string | null;
    @Column({ type: 'varchar', nullable: true }) background: string | null;
    @Column({ type: 'tinyint', nullable: true }) checked_vertically: number | null;
    @Column({ type: 'varchar', nullable: true }) hours: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}