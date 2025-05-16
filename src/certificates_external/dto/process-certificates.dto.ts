// src/dto/process-certificates.dto.ts
export class ProcessCertificatesDto {
    clientId: number;
    startDate: string;
    endDate: string;
    searchUser: string;
    searchEmail: string;
    searchIdentification: string;
    searchCertificate: string;
    selectedCertificate: string;
    filename: string;
  }