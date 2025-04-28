// src/progress-users/interfaces/user-status.interface.ts

export interface UserStatusFilters {
    startDate: string;
    endDate: string;
    clubId?: number;
    searchCourse?: string;
    searchUser?: string;
    searchEmail?: string;
    searchIdentification?: string;
    clientid?: number;
    page?: number;
    pageSize?: number;
  }
  
  export interface UserStatusData {
    clubs: any[];
    users: any[];
    userData: Record<number, any>;
  }
  
  export interface UserData {
    active_inactive: string;
    identification: string;
    name: string;
    last_name: string;
    email: string;
    role: string;
    company: string;
    [key: string]: any; // Para las propiedades dinámicas de club_*
  }