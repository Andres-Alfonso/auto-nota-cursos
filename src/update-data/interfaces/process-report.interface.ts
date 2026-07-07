// interfaces/process-report.interface.ts
export interface ProcessReport {
  totalUsersProcessed: number;
  totalCoursesProcessed: number;
  validUsers: number;
  invalidUsers: number;
  usersNotFound: number;
  clubUsersDeleted: number;
  clubUsersCreated: number;
  errors: ProcessError[];
  warnings: ProcessWarning[];
  summary: string;
}

export interface ProcessError {
  type: 'USER_NOT_FOUND' | 'CLUB_NOT_FOUND' | 'DATABASE_ERROR' | 'EXCEL_ERROR';
  message: string;
  data?: any;
}

export interface ProcessWarning {
  type: 'DUPLICATE_USER' | 'EMPTY_ROW' | 'INVALID_DATA';
  message: string;
  data?: any;
}