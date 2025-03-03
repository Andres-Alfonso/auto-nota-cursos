export interface GeneralProgress {
    id?: number;
    id_user: number;
    id_videoroom: number;
    porcen: number;
  }
  
  export interface UserProgressVideoRoom {
    id?: number;
    id_user: number;
    id_videoroom: number;
    id_content: number;
    porcen: number;
  }
  
  export interface UserProgressTaskVideoRoom {
    id?: number;
    id_user: number;
    id_videoroom: number;
    id_task: number;
    porcen: number;
  }
  
  export interface UserProgressEvaluationVideoRoom {
    id?: number;
    id_user: number;
    id_videoroom: number;
    id_evaluation: number;
    porcen: number;
  }
  
  export interface EvaluationUser {
    id?: number;
    user_id: number;
    evaluation_id: number;
    nota: number;
    approved: number;
    intentos: number;
  }
  
  export interface EvaluationHistory {
    id?: number;
    evaluation_id: number;
    user_id: number;
    nota: number;
    approved: number;
  }
  
  export interface Answer {
    id?: number;
    evaluation_id: number;
    question_id: number;
    option_id: number | null;
    user_id: number;
    content: string | null;
  }