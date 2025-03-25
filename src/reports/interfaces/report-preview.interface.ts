export interface ReportColumn {
    title: string;
    field: string;
    sortable?: boolean;
    width?: string;
    align?: 'left' | 'center' | 'right';
    format?: 'text' | 'date' | 'number' | 'status';
  }
  
  export interface ReportPreviewData {
    columns: ReportColumn[];
    rows: any[];
    totalUsers?: number;
    currentPage?: number;
    totalPages?: number;
    limit?: number;
  }