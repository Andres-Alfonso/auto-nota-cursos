import { 
  Controller, 
  Post, 
  Body, 
  HttpStatus, 
  Get,
  Param,
  Res,
  Logger,
  HttpException,
  UseInterceptors,
  UploadedFile,
  Query
} from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, Multer } from 'multer';

import { ExternalService } from './services/external.service';
import { ProcessCertificatesDto } from './dto/process-certificates.dto';
import * as dayjs from 'dayjs';

import { UserCertificate } from './models/user-certificate.entity';
import { Documents } from './models/documents.entity';
import { UserDocument } from './models/user-document.entity';
import { DocumentRequirement } from './models/document-requirement.entity';
import { Repository } from 'typeorm/repository/Repository';
import { User } from './models/user.entity';
import { InjectRepository } from '@nestjs/typeorm';


// Definir el lugar donde se guardarán los archivos
const storageConfig = diskStorage({
  destination: (req, file, cb) => {
    // Crear directorio si no existe
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const certificatesDir = path.join(uploadsDir, 'certificates_externals');
    
    if (!fs.existsSync(certificatesDir)) {
      fs.mkdirSync(certificatesDir, { recursive: true });
    }
    
    cb(null, certificatesDir);
  },
  filename: (req, file, cb) => {
    // Obtener nombre de archivo de los datos JSON
    const jsonData = JSON.parse(req.body.data);
    const fileName = jsonData.filename || `certificados_externos_${Date.now()}.csv`;
    cb(null, fileName);
  }
});

@Controller('api/external')
export class ExternalController {
  private readonly logger = new Logger(ExternalController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly certificateExternalService: ExternalService,
    @InjectRepository(UserCertificate)
    private userCertificateRepository: Repository<UserCertificate>,
    @InjectRepository(Documents)
    private documentsRepository: Repository<Documents>,
    @InjectRepository(UserDocument)
    private userDocumentRepository: Repository<UserDocument>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(DocumentRequirement)
    private documentRequirementRepository: Repository<DocumentRequirement>
  ) {}

  @Post('process-certificates')
  async processCertificates(@Body() dto: ProcessCertificatesDto): Promise<any> {
    try {
      this.logger.log(`Procesando certificados para el cliente ${dto.clientId}`);
      
      // Obtener certificados procesados
      const processedCertificates = await this.getCertificates(
        dto.clientId,
        dto.startDate,
        dto.endDate,
        dto.searchUser,
        dto.searchEmail,
        dto.searchIdentification,
        dto.searchCertificate,
        dto.selectedCertificate
      );
      
      // Generar el CSV
      const filePath = await this.generateCSV(
        processedCertificates.groupedCertificates,
        dto.startDate,
        dto.endDate,
        dto.filename
      );
      
      // Crear URL de descarga
      const baseUrl = this.configService.get<string>('https://homologation-notes.kalmsystem.com');
      const fileName = path.basename(filePath);
      const downloadUrl = `${baseUrl}/api/v1/api/external/download-certificate/${fileName}`;
      
      return {
        statusCode: HttpStatus.OK,
        message: 'Archivo CSV generado correctamente',
        downloadUrl: downloadUrl,
        fileName: fileName
      };
    } catch (error) {
      this.logger.error(`Error al procesar certificados: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al procesar certificados',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('download-certificate/:fileName')
  async downloadCertificate(
    @Param('fileName') fileName: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
      const certificatesDir = path.join(uploadsDir, 'certificates_externals');
      const filePath = path.join(certificatesDir, fileName);
      
      if (!fs.existsSync(filePath)) {
        throw new HttpException('El archivo no existe', HttpStatus.NOT_FOUND);
      }
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      
      // Crear un stream de lectura y enviarlo como respuesta
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      this.logger.error(`Error al descargar el archivo: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al descargar el archivo',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Método para generar el CSV
  private async generateCSV(
    groupedCertificates: any[],
    startDate: string,
    endDate: string,
    filename: string
  ): Promise<string> {
    // Crear el directorio si no existe
    const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
    const certificatesDir = path.join(uploadsDir, '/reports/certificates_externals');
    
    if (!fs.existsSync(certificatesDir)) {
      fs.mkdirSync(certificatesDir, { recursive: true });
    }
    
    // Ruta completa del archivo
    const filePath = path.join(certificatesDir, filename);
    
    // Crear un stream de escritura
    const writeStream = fs.createWriteStream(filePath);
    writeStream.write('\uFEFF'); // BOM para UTF-8
    
    // Escribir encabezados del CSV
    writeStream.write(
      'Estado,Cedula,Nombre,Apellido,Correo,Nombre del Certificado,Fecha de Emisión,Fecha de Vencimiento,Estado del Certificado,Ruta de archivo\n'
    );
    
    // Procesar cada certificado
    for (const certificate of groupedCertificates) {
      const certificateName = certificate.name;
      
      // Procesar cada usuario con sus certificados
      for (const user of certificate.users) {
        // Obtener nombre y apellido separados
        const fullName = user.user_name;
        const nameParts = fullName ? fullName.split(' ', 2) : ['N/A', 'N/A'];
        const firstName = nameParts[0] || 'N/A';
        const lastName = nameParts[1] || 'N/A';
        const statusValidation = user.user_status;
        
        // Obtener estado traducido
        const status = this.translateStatus(user.status);
        const statusUser = statusValidation;
        
        // Procesar cada certificado del usuario
        for (const userCertificate of user.certificates) {
          const issueDate = userCertificate.issue_date || 'N/A';
          const expiryDate = userCertificate.expiry_date || 'N/A';
          const filePath = userCertificate.file_path || '';
          
          // Escapar campos y escribir fila en el CSV
          const row = [
            this.escapeCSV(statusUser),
            this.escapeCSV(user.user_identification),
            this.escapeCSV(firstName),
            this.escapeCSV(lastName),
            this.escapeCSV(user.user_email),
            this.escapeCSV(certificateName),
            this.escapeCSV(issueDate),
            this.escapeCSV(expiryDate),
            this.escapeCSV(status),
            this.escapeCSV(filePath)
          ].join(',');
          
          writeStream.write(row + '\n');
        }
      }
    }
    
    // Cerrar el stream y esperar a que termine
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });
    
    return filePath;
  }
  
  // Método para escapar campos del CSV
  private escapeCSV(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    value = String(value);
    
    // Si el valor contiene coma, comilla o salto de línea, encerrarlo en comillas
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      // Escapar las comillas duplicándolas
      value = value.replace(/"/g, '""');
      return `"${value}"`;
    }
    
    return value;
  }
  

  // Método principal para obtener los certificados
  private async getCertificates(
    clientId: number,
    startDate: string,
    endDate: string,
    searchUser: string,
    searchEmail: string,
    searchIdentification: string,
    searchCertificate: string,
    selectedCertificate: string
  ): Promise<any> {
    // Convertir fechas a objetos dayjs
    const start = dayjs(startDate);
    const end = dayjs(endDate).endOf('day');
    
    // 1. Obtener certificados de UserCertificate
    let userCertificatesQuery = this.userCertificateRepository
      .createQueryBuilder('uc')
      .where('uc.client_id = :clientId', { clientId })
      .andWhere('uc.created_at BETWEEN :startDate AND :endDate', {
        startDate: start.format('YYYY-MM-DD HH:mm:ss'),
        endDate: end.format('YYYY-MM-DD HH:mm:ss')
      });
    
    // Aplicar filtros
    if (searchCertificate) {
      userCertificatesQuery = userCertificatesQuery
        .andWhere('uc.name LIKE :name', { name: `%${searchCertificate}%` });
    }
    
    if (selectedCertificate) {
      userCertificatesQuery = userCertificatesQuery
        .andWhere('uc.name = :selectedName', { selectedName: selectedCertificate });
    }
    
    // Aplicar filtros de usuario
    if (searchUser || searchEmail || searchIdentification) {
      userCertificatesQuery = userCertificatesQuery
        .innerJoin('uc.user', 'user');
      
      if (searchUser) {
        userCertificatesQuery = userCertificatesQuery
          .andWhere('user.name LIKE :userName', { userName: `%${searchUser}%` });
      }
      
      if (searchEmail) {
        userCertificatesQuery = userCertificatesQuery
          .andWhere('user.email LIKE :userEmail', { userEmail: `%${searchEmail}%` });
      }
      
      if (searchIdentification) {
        userCertificatesQuery = userCertificatesQuery
          .andWhere('user.identification LIKE :userIdentification', { userIdentification: `%${searchIdentification}%` });
      }
    }
    
    // Obtener certificados con usuarios
    const userCertificates = await userCertificatesQuery
      .leftJoinAndSelect('uc.user', 'ucUser')
      .getMany();
    
    // Procesar y agrupar los certificados por nombre
    const userCertificatesGrouped = this.processUserCertificates(userCertificates);
    
    // 2. Obtener certificados de documentos
    let documentsQuery = this.documentsRepository
      .createQueryBuilder('doc')
      .where('doc.client_id = :clientId', { clientId })
      .andWhere('doc.type_document_category = :category', { category: 'certificate' })
      .andWhere('doc.created_at BETWEEN :startDate AND :endDate', {
        startDate: start.format('YYYY-MM-DD HH:mm:ss'),
        endDate: end.format('YYYY-MM-DD HH:mm:ss')
      });
    
    // Aplicar filtros
    if (searchCertificate || selectedCertificate) {
      documentsQuery = documentsQuery
        .innerJoin('doc.documentRequirements', 'req');
      
      if (searchCertificate) {
        documentsQuery = documentsQuery
          .andWhere('req.title LIKE :title', { title: `%${searchCertificate}%` });
      }
      
      if (selectedCertificate) {
        documentsQuery = documentsQuery
          .andWhere('req.title = :selectedTitle', { selectedTitle: selectedCertificate });
      }
    }
    
    // Aplicar filtros de usuario
    if (searchUser || searchEmail || searchIdentification) {
      documentsQuery = documentsQuery
        .innerJoin('doc.userDocuments', 'udoc')
        .innerJoin('udoc.user', 'user');
      
      if (searchUser) {
        documentsQuery = documentsQuery
          .andWhere('user.name LIKE :userName', { userName: `%${searchUser}%` });
      }
      
      if (searchEmail) {
        documentsQuery = documentsQuery
          .andWhere('user.email LIKE :userEmail', { userEmail: `%${searchEmail}%` });
      }
      
      if (searchIdentification) {
        documentsQuery = documentsQuery
          .andWhere('user.identification LIKE :userIdentification', { userIdentification: `%${searchIdentification}%` });
      }
    }
    
    // Obtener documentos con requisitos y documentos de usuario
    const documents = await documentsQuery
      .leftJoinAndSelect('doc.documentRequirements', 'docReq')
      .leftJoinAndSelect('doc.userDocuments', 'userDoc')
      .leftJoinAndSelect('userDoc.user', 'userDocUser')
      .getMany();
    
    // Procesar documentos
    const userDocumentsGrouped = this.processUserDocuments(documents);
    
    // 3. Combinar y agrupar certificados por nombre
    const allCertificates = [...userCertificatesGrouped, ...userDocumentsGrouped];
    const groupedCertificates = this.groupCertificatesByName(allCertificates);
    
    // 4. Calcular estadísticas totales
    const totalCertificates = groupedCertificates.reduce((sum, cert) => sum + cert.total_files, 0);
    const activeCertificates = groupedCertificates.reduce((sum, cert) => sum + cert.active_files, 0);
    const expiringCertificates = groupedCertificates.reduce((sum, cert) => sum + cert.expiring_files, 0);
    const expiredCertificates = groupedCertificates.reduce((sum, cert) => sum + cert.expired_files, 0);
    
    return {
      groupedCertificates,
      totalCertificates,
      activeCertificates,
      expiringCertificates,
      expiredCertificates
    };
  }
  
  // Método para procesar certificados de usuario
  private processUserCertificates(userCertificates: UserCertificate[]): any[] {
    const now = dayjs();
    const thirtyDaysFromNow = now.add(30, 'day');
    
    // Agrupar por nombre
    const certificatesByName = userCertificates.reduce((groups, cert) => {
      const name = cert.name;
      if (!groups[name]) {
        groups[name] = [];
      }
      groups[name].push(cert);
      return groups;
    }, {});
    
    return Object.entries(certificatesByName).map(([name, certificates]) => {
      const userCerts = certificates as UserCertificate[];
      
      // Agrupar por user_id
      const userMap = new Map();
      
      for (const cert of userCerts) {
        const userId = cert.user_id;
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            user: cert.user,
            certificates: []
          });
        }
        
        // Determinar estados
        const isActive = this.isValidCertificate(cert);
        let isExpiring = false;
        let isExpired = false;
        let daysUntilExpiry: number | null = null;

        
        if (cert.expiry_date) {
          const expiryDate = dayjs(cert.expiry_date);
          isExpiring = expiryDate.isAfter(now) && expiryDate.isBefore(thirtyDaysFromNow);
          isExpired = expiryDate.isBefore(now);
          daysUntilExpiry = expiryDate.diff(now, 'day');
        }
        
        userMap.get(userId).certificates.push({
          certificate_type: cert.name,
          file_path: cert.file_path,
          issue_date: cert.issue_date ? dayjs(cert.issue_date).format('DD/MM/YYYY') : 'N/A',
          expiry_date: cert.expiry_date ? dayjs(cert.expiry_date).format('DD/MM/YYYY') : 'N/A',
          is_active: isActive,
          is_expiring: isExpiring,
          is_expired: isExpired,
          days_until_expiry: daysUntilExpiry
        });
      }
      
      // Convertir el mapa a un array de usuarios
      const users = Array.from(userMap.entries()).map(([userId, userData]) => {
        const user = userData.user;
        const certificatesList = userData.certificates;
        
        // Determinar estado general del usuario
        let status = 'active';
        if (certificatesList.some(cert => cert.is_expired)) {
          status = 'expired';
        } else if (certificatesList.some(cert => cert.is_expiring)) {
          status = 'expiring';
        }
        
        return {
          user_id: userId,
          user_name: user.name,
          user_email: user.email,
          user_identification: user.identification || 'N/A',
          user_status: user.status_validation === 1 ? 'Activo' : 'Inactivo',
          status: status,
          certificates_count: certificatesList.length,
          active_certificates: certificatesList.filter(cert => cert.is_active).length,
          certificates: certificatesList
        };
      });
      
      // Contar archivos por estado
      let activeFiles = 0;
      let expiringFiles = 0;
      let expiredFiles = 0;
      
      for (const user of users) {
        for (const cert of user.certificates) {
          if (cert.is_expired) {
            expiredFiles++;
          } else if (cert.is_expiring) {
            expiringFiles++;
          } else if (cert.is_active) {
            activeFiles++;
          }
        }
      }
      
      return {
        name: name.trim().toUpperCase(),
        users_count: users.length,
        total_files: userCerts.length,
        active_files: activeFiles,
        expiring_files: expiringFiles,
        expired_files: expiredFiles,
        certificate_types: ['UserCertificate'],
        users: users
      };
    });
  }
  
  // Método para procesar documentos de usuario
  private processUserDocuments(documents: Documents[]): any[] {
    const now = dayjs();
    const thirtyDaysFromNow = now.add(30, 'day');
    
    return documents.map(document => {
      const name = document.documentRequirements[0]?.title || document.name;
      
      // Agrupar documentos de usuario por user_id
      const userMap = new Map();
      
      for (const userDoc of document.userDocuments) {
        const userId = userDoc.user_id;
        
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            user: userDoc.user,
            certificates: []
          });
        }
        
        // Determinar estados
        const isActive = !userDoc.expiry_date || dayjs(userDoc.expiry_date).isAfter(now);
        let isExpiring = false;
        let isExpired = false;
        let daysUntilExpiry: number | null = null;
        
        if (userDoc.expiry_date) {
          const expiryDate = dayjs(userDoc.expiry_date);
          isExpiring = expiryDate.isAfter(now) && expiryDate.isBefore(thirtyDaysFromNow);
          isExpired = expiryDate.isBefore(now);
          daysUntilExpiry = expiryDate.diff(now, 'day');
        }
        
        userMap.get(userId).certificates.push({
          certificate_type: name,
          file_path: userDoc.file_path,
          issue_date: userDoc.issue_date ? dayjs(userDoc.issue_date).format('DD/MM/YYYY') : 'N/A',
          expiry_date: userDoc.expiry_date ? dayjs(userDoc.expiry_date).format('DD/MM/YYYY') : 'N/A',
          is_active: isActive,
          is_expiring: isExpiring,
          is_expired: isExpired,
          days_until_expiry: daysUntilExpiry
        });
      }
      
      // Convertir el mapa a un array de usuarios
      const users = Array.from(userMap.entries()).map(([userId, userData]) => {
        const user = userData.user;
        const certificatesList = userData.certificates;
        
        // Determinar estado general del usuario
        let status = 'active';
        if (certificatesList.some(cert => cert.is_expired)) {
          status = 'expired';
        } else if (certificatesList.some(cert => cert.is_expiring)) {
          status = 'expiring';
        }
        
        return {
          user_id: userId,
          user_name: user.name,
          user_email: user.email,
          user_identification: user.identification || 'N/A',
          user_status: user.status_validation === 1 ? 'Activo' : 'Inactivo',
          status: status,
          certificates_count: certificatesList.length,
          active_certificates: certificatesList.filter(cert => cert.is_active).length,
          certificates: certificatesList
        };
      });
      
      // Contar archivos por estado
      let activeFiles = 0;
      let expiringFiles = 0;
      let expiredFiles = 0;
      
      for (const user of users) {
        for (const cert of user.certificates) {
          if (cert.is_expired) {
            expiredFiles++;
          } else if (cert.is_expiring) {
            expiringFiles++;
          } else if (cert.is_active) {
            activeFiles++;
          }
        }
      }
      
      return {
        name: name.trim().toUpperCase(),
        users_count: users.length,
        total_files: document.userDocuments.length,
        active_files: activeFiles,
        expiring_files: expiringFiles,
        expired_files: expiredFiles,
        certificate_types: ['UserDocument'],
        users: users
      };
    });
  }

  // Método para agrupar certificados por nombre (continuación)
  private groupCertificatesByName(certificates: any[]): any[] {
    const groupedMap = new Map();
    
    for (const certificate of certificates) {
      const name = certificate.name;
      
      if (!groupedMap.has(name)) {
        groupedMap.set(name, {
          name: name,
          users_count: 0,
          total_files: 0,
          active_files: 0,
          expiring_files: 0,
          expired_files: 0,
          certificate_types: [],
          users: []
        });
      }
      
      const group = groupedMap.get(name);
      
      // Actualizar estadísticas
      group.total_files += certificate.total_files;
      group.active_files += certificate.active_files;
      group.expiring_files += certificate.expiring_files;
      group.expired_files += certificate.expired_files;
      group.certificate_types = [...new Set([...group.certificate_types, ...certificate.certificate_types])];
      
      // Combinar usuarios
      for (const user of certificate.users) {
        const existingUserIndex = group.users.findIndex(u => u.user_id === user.user_id);
        
        if (existingUserIndex >= 0) {
          // Actualizar usuario existente
          const existingUser = group.users[existingUserIndex];
          existingUser.certificates_count += user.certificates_count;
          existingUser.active_certificates += user.active_certificates;
          existingUser.certificates = [...existingUser.certificates, ...user.certificates];
          
          // Actualizar estado si es necesario
          if (user.status === 'expired' || existingUser.status === 'expired') {
            existingUser.status = 'expired';
          } else if (user.status === 'expiring' || existingUser.status === 'expiring') {
            existingUser.status = 'expiring';
          }
        } else {
          // Agregar nuevo usuario
          group.users.push({ ...user });
        }
      }
      
      // Actualizar contador de usuarios
      group.users_count = group.users.length;
    }
    
    // Convertir mapa a array y ordenar por nombre
    return Array.from(groupedMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  
  // Método para verificar si un certificado es válido
  private isValidCertificate(certificate: UserCertificate): boolean {
    if (!certificate.expiry_date) {
      return true; // Si no tiene fecha de vencimiento, se considera válido
    }
    
    const now = dayjs();
    const expiryDate = dayjs(certificate.expiry_date);
    
    return expiryDate.isAfter(now);
  }

  private createCsvStream(groupedCertificates: any) {
    // Importar módulo para crear CSV
    const { Transform } = require('stream');
    const { stringify } = require('csv-stringify');
    
    // Crear stream de transformación para procesar los datos
    const transformStream = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        callback(null, chunk);
      }
    });
    
    // Configurar el stringifier CSV
    const stringifier = stringify({
      header: true,
      columns: {
        'Estado': 'estado',
        'Cedula': 'cedula',
        'Nombre': 'nombre',
        'Apellido': 'apellido',
        'Correo': 'correo',
        'Nombre del Certificado': 'certificado',
        'Fecha de Emisión': 'fechaEmision',
        'Fecha de Vencimiento': 'fechaVencimiento',
        'Estado del Certificado': 'estadoCertificado',
        'Ruta de archivo': 'rutaArchivo'
      }
    });
    
    // Escribir los datos en el stream
    process.nextTick(() => {
      // Escribir cada certificado en el stream
      for (const certificate of groupedCertificates) {
        const certificateName = certificate.name;
        
        // Procesar cada usuario con sus certificados
        for (const user of certificate.users) {
          // Obtener nombre y apellido separados
          const fullName = user.user_name;
          const nameParts = fullName ? fullName.split(' ', 2) : ['N/A', 'N/A'];
          const firstName = nameParts[0] || 'N/A';
          const lastName = nameParts[1] || 'N/A';
          const statusValidation = user.user_status;
          
          // Obtener estado
          const status = this.translateStatus(user.status);
          const statusUser = statusValidation;
          
          // Procesar cada certificado del usuario
          for (const userCertificate of user.certificates) {
            const issueDate = userCertificate.issue_date || 'N/A';
            const expiryDate = userCertificate.expiry_date || 'N/A';
            const filePath = userCertificate.file_path || '';
            
            // Escribir fila en el CSV
            transformStream.push({
              estado: statusUser,
              cedula: user.user_identification,
              nombre: firstName,
              apellido: lastName,
              correo: user.user_email,
              certificado: certificateName,
              fechaEmision: issueDate,
              fechaVencimiento: expiryDate,
              estadoCertificado: status,
              rutaArchivo: filePath
            });
          }
        }
      }
      
      // Finalizar el stream
      transformStream.push(null);
    });
    
    // Conectar el stream de transformación con el stringifier
    return transformStream.pipe(stringifier);
  }

  private translateStatus(status: string): string {
    // Esta función debería traducir los códigos de estado a textos descriptivos
    // similar a la función en Laravel
    switch (status) {
      case 'active':
        return 'Activo';
      case 'expired':
        return 'Vencido';
      case 'expiring_soon':
        return 'Por vencer';
      default:
        return status || 'Desconocido';
    }
  }

  @Post('certificates-external')
  async processCorrectCertificatesExternal(@Body() requestData: any) {
    try {
      // Extraer datos de la solicitud
      const { 
        client_id
      } = requestData;

      // Validar datos obligatorios
      if (!client_id) {
        throw new HttpException('Faltan datos obligatorios', HttpStatus.BAD_REQUEST);
      }

      await this.certificateExternalService.testCertificateExternals(client_id);

      return {
        statusCode: HttpStatus.ACCEPTED,
        message: 'Se estan buscando certificados del cliente.',
      }
    } catch (error) {
      this.logger.error(`Error al generar reporte: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al generar el reporte', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Endpoint para probar la sincronización de certificados y documentos para un cliente
   * No realiza cambios, solo muestra qué asociaciones se crearían
   */
  @Post('test-sync-certificates-documents')
  async testSyncCertificatesDocuments(@Body() requestData: any) {
    try {
      const { client_id } = requestData;

      if (!client_id) {
        throw new HttpException('El ID del cliente es obligatorio', HttpStatus.BAD_REQUEST);
      }

      const testResults = await this.certificateExternalService.testSyncClientCertificatesWithDocuments(client_id);

      return {
        statusCode: HttpStatus.OK,
        message: 'Prueba de sincronización completada exitosamente',
        data: testResults
      };
    } catch (error) {
      this.logger.error(`Error en prueba de sincronización: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al realizar la prueba de sincronización', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Endpoint para ejecutar la sincronización real de certificados y documentos para un cliente
   * Crea las asociaciones necesarias en la tabla document_user
   */
  @Post('sync-certificates-documents')
  async syncCertificatesDocuments(@Body() requestData: any) {
    try {
      const { client_id } = requestData;

      if (!client_id) {
        throw new HttpException('El ID del cliente es obligatorio', HttpStatus.BAD_REQUEST);
      }

      const syncResults = await this.certificateExternalService.syncClientCertificatesWithDocuments(client_id);

      return {
        statusCode: HttpStatus.OK,
        message: 'Sincronización completada exitosamente',
        data: syncResults
      };
    } catch (error) {
      this.logger.error(`Error en sincronización: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al realizar la sincronización', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Endpoint para sincronizar certificados y documentos para un usuario específico
   */
  @Post('sync-user-certificates')
  async syncUserCertificates(@Body() requestData: any) {
    try {
      const { user_id } = requestData;

      if (!user_id) {
        throw new HttpException('El ID del usuario es obligatorio', HttpStatus.BAD_REQUEST);
      }

      const syncResults = await this.certificateExternalService.syncUserCertificatesWithDocuments(user_id);

      return {
        statusCode: HttpStatus.OK,
        message: 'Sincronización del usuario completada exitosamente',
        data: syncResults
      };
    } catch (error) {
      this.logger.error(`Error en sincronización de usuario: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Error al realizar la sincronización del usuario', 
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}