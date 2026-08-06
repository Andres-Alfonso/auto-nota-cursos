/**
 * RESTORES · Mini-juegos del club (sopa de letras, crucigrama, drag&drop,
 * ahorcado, memoria, secuencias, completar frases) + sus intentos de usuario.
 * Ver notas de diseño en club-core.entities.ts.
 */
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

// ─── Sopa de letras ─────────────────────────────────────────────────────────

@Entity({ name: 'alphabet_soups' })
export class AlphabetSoup {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) tilte: string | null; // typo real en BD
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'int', nullable: true }) rows: number | null;
    @Column({ type: 'int', nullable: true }) columns: number | null;
    @Column({ type: 'text', nullable: true }) words: string | null; // JSON crudo
    @Column({ type: 'varchar', nullable: true }) image: string | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'datetime', nullable: true }) date_end: Date | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'tinyint', nullable: true }) activate_qualify: number | null;
    @Column({ type: 'tinyint', nullable: true }) public: number | null;
    @Column({ type: 'float', nullable: true }) note_aproved: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int', nullable: true }) time: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** ⚠ FK con typo real en BD: 'alhabet_soup_id' (falta la 'p'). */
@Entity({ name: 'alphabet_soup_users' })
export class AlphabetSoupUsers {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) note: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int' }) alhabet_soup_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

// ─── Completar frases ───────────────────────────────────────────────────────

@Entity({ name: 'complete_sentences' })
export class CompleteSentences {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'datetime', nullable: true }) date_finish: Date | null;
    @Column({ type: 'tinyint', nullable: true }) memory_calification: number | null;
    @Column({ type: 'tinyint', nullable: true }) publish: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'float', nullable: true }) approving_note: number | null;
    @Column({ type: 'int', nullable: true }) completion_time: number | null;
    @Column({ type: 'int', nullable: true }) user_create: number | null;
    @Column({ type: 'varchar', nullable: true }) miniature: string | null;
    // ⚠ La FK de club en este modelo se llama 'id_club' (no 'club_id')
    @Column({ type: 'int' }) id_club: number;
    @Column({ type: 'tinyint', nullable: true }) enable_context: number | null;
    @Column({ type: 'text', nullable: true }) game_context: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'complete_sentences_users' })
export class CompleteSentencesUser {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'int' }) id_complete_sentences: number;
    @Column({ type: 'float', nullable: true }) note: number | null;
    @Column({ type: 'int', nullable: true }) intentos: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'complete_sentences_history_users' })
export class CompleteSentencesHistoryUsers {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'int' }) complete_sentences_id: number;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'float', nullable: true }) note: number | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

// ─── Crucigrama ─────────────────────────────────────────────────────────────

@Entity({ name: 'crosswords' })
export class Crossword {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'datetime', nullable: true }) date_end: Date | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'tinyint', nullable: true }) activate_qualify: number | null;
    @Column({ type: 'tinyint', nullable: true }) public: number | null;
    @Column({ type: 'float', nullable: true }) note_aproved: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int', nullable: true }) time: number | null;
    @Column({ type: 'varchar', nullable: true }) miniature: string | null;
    @Column({ type: 'tinyint', nullable: true }) enable_context: number | null;
    @Column({ type: 'text', nullable: true }) game_context: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'words_hints' })
export class WordsHints {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) word: string | null;
    @Column({ type: 'varchar', nullable: true }) hint: string | null;
    @Column({ type: 'int' }) crosswords_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

// ─── Arrastrar y soltar ─────────────────────────────────────────────────────

@Entity({ name: 'drag_drops' })
export class DragDrop {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) tilte: string | null; // typo real
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'datetime', nullable: true }) date_end: Date | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'tinyint', nullable: true }) activate_qualify: number | null;
    @Column({ type: 'tinyint', nullable: true }) public: number | null;
    @Column({ type: 'float', nullable: true }) note_aproved: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int', nullable: true }) time: number | null;
    @Column({ type: 'varchar', nullable: true }) miniature: string | null;
    @Column({ type: 'tinyint', nullable: true }) enable_context: number | null;
    @Column({ type: 'text', nullable: true }) game_context: string | null;
    @Column({ type: 'varchar', nullable: true }) draggable_type: string | null;
    @Column({ type: 'tinyint', nullable: true }) enable_instructions: number | null;
    @Column({ type: 'text', nullable: true }) instructions: string | null;
    @Column({ type: 'varchar', nullable: true }) type_instructions: string | null;
    @Column({ type: 'varchar', nullable: true }) url_source_instructions: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

/** Nombre de tabla real con doble guion bajo: words__image__drag_drops. */
@Entity({ name: 'words__image__drag_drops' })
export class WordsImageDragDrop {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'int' }) drag_drop_id: number;
    @Column({ type: 'varchar', nullable: true }) word: string | null;
    @Column({ type: 'varchar', nullable: true }) image: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

// ─── Ahorcado ────────────────────────────────────────────────────────────────

@Entity({ name: 'hanging_games' })
export class HangingGame {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'tinyint', nullable: true }) activate_qualify: number | null;
    @Column({ type: 'float', nullable: true }) approving_note: number | null;
    @Column({ type: 'tinyint', nullable: true }) public: number | null;
    @Column({ type: 'varchar', nullable: true }) miniature: string | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int', nullable: true }) time: number | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'datetime', nullable: true }) date_finish: Date | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'phrases_words' })
export class PhraseWord {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) phrase: string | null;
    @Column({ type: 'varchar', nullable: true }) word: string | null;
    @Column({ type: 'int' }) hanging_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'hanging_game_users' })
export class HangingGameUsers {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) note: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int', nullable: true }) phrase_word_id: number | null;
    @Column({ type: 'int' }) hanging_game_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

// ─── Memoria ─────────────────────────────────────────────────────────────────

@Entity({ name: 'memory_games' })
export class MemoryGame {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) name: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'int', nullable: true }) user_create: number | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'varchar', nullable: true }) type: string | null;
    @Column({ type: 'varchar', nullable: true }) image_1: string | null;
    @Column({ type: 'varchar', nullable: true }) image_2: string | null;
    @Column({ type: 'varchar', nullable: true }) image_3: string | null;
    @Column({ type: 'varchar', nullable: true }) image_4: string | null;
    @Column({ type: 'varchar', nullable: true }) image_5: string | null;
    @Column({ type: 'varchar', nullable: true }) image_6: string | null;
    @Column({ type: 'varchar', nullable: true }) image_7: string | null;
    @Column({ type: 'varchar', nullable: true }) image_8: string | null;
    @Column({ type: 'varchar', nullable: true }) image_9: string | null;
    @Column({ type: 'varchar', nullable: true }) image_10: string | null;
    @Column({ type: 'varchar', nullable: true }) image_11: string | null;
    @Column({ type: 'varchar', nullable: true }) image_12: string | null;
    @Column({ type: 'tinyint', nullable: true }) memory_calification: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'float', nullable: true }) approving_note: number | null;
    @Column({ type: 'int', nullable: true }) completion_time: number | null;
    @Column({ type: 'int', nullable: true }) countMatch: number | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'datetime', nullable: true }) date_finish: Date | null;
    @Column({ type: 'tinyint', nullable: true }) publish: number | null;
    @Column({ type: 'varchar', nullable: true }) miniature: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'memory_game_users' })
export class MemoryGameUsers {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) note: number | null;
    @Column({ type: 'int', nullable: true }) intentos: number | null;
    @Column({ type: 'int' }) id_memory_game: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

// ─── Secuencia de tiempo ─────────────────────────────────────────────────────

@Entity({ name: 'time_sequences' })
export class TimeSequence {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) title: string | null;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'datetime', nullable: true }) date_start: Date | null;
    @Column({ type: 'datetime', nullable: true }) date_end: Date | null;
    @Column({ type: 'int' }) club_id: number;
    @Column({ type: 'int', nullable: true }) user_id: number | null;
    @Column({ type: 'tinyint', nullable: true }) activate_qualify: number | null;
    @Column({ type: 'tinyint', nullable: true }) public: number | null;
    @Column({ type: 'float', nullable: true }) note_aproved: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int', nullable: true }) time: number | null;
    @Column({ type: 'varchar', nullable: true }) miniature: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'sequences' })
export class Sequences {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'varchar', nullable: true }) image: string | null;
    @Column({ type: 'int', nullable: true }) order: number | null;
    @Column({ type: 'int' }) time_sequence_id: number;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}

@Entity({ name: 'time_sequence_users' })
export class TimeSequenceUsers {
    @PrimaryGeneratedColumn() id: number;
    @Column({ type: 'float', nullable: true }) note: number | null;
    @Column({ type: 'int', nullable: true }) attempts: number | null;
    @Column({ type: 'int' }) time_sequence_id: number;
    @Column({ type: 'int' }) user_id: number;
    @Column({ type: 'datetime', nullable: true }) created_at: Date | null;
    @Column({ type: 'datetime', nullable: true }) updated_at: Date | null;
}