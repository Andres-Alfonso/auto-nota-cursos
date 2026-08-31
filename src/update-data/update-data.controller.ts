import { Controller, Post, Body, UploadedFile, UseInterceptors, ParseIntPipe, HttpStatus, HttpException, Req, BadRequestException, InternalServerErrorException, UploadedFiles } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { UpdateDataService } from './services/update-data.service';
import { UploadProgressDto } from '../progress-users/dto/upload-progress.dto';
import { diskStorage, Multer } from 'multer';
import { DataSource, Repository, In } from 'typeorm';
import * as xlsx from 'xlsx';
import * as bcrypt from 'bcrypt';

import { User } from '../reports_v2/entities/user.entity';
import { Club } from '../reports_v2/entities/club.entity';
import { ClubUser } from '../reports_v2/entities/club-user.entity';
import { ImportUsersDto } from 'src/progress-users/dto/upload-import.dto';
import { Client } from 'src/reports_v2/entities/client.entity';
import { UpdateEvaluationProgressDto } from './dto/update-evaluation-progress.dro';
import { UploadUsersClubsDto } from './dto/upload-users-clubs.dto';

interface UserData {
  cedula?: string;
  numero_identificacion?: string;
  documento?: string;
  numero_de_cedula?: string;
  numero_de_documento?: string;
  email?: string;
  correo?: string;
  [key: string]: any;
}

interface DeleteUsersRequest {
  users: UserData[];
  clubs: number[];
  clientId?: number | string; // Puede ser un número o una cadena
}

interface ProcessResult {
  totalProcessed: number;
  totalRemoved: number;
  errors: string[];
  success: boolean;
  message: string;
}

interface ProcessRowResult {
  success: boolean;
  error: string | null;
  user: any;
  wasNewEnrollment?: boolean; // opcional: solo aparece en el retorno de éxito
}


@Controller('update-data')
export class UpdateDataController {
  constructor(
    private readonly UpdateDataService: UpdateDataService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    
    @InjectRepository(Club)
    private clubRepository: Repository<Club>,
    
    @InjectRepository(ClubUser)
    private clubUserRepository: Repository<ClubUser>,

    @InjectRepository(Client)
    private clientRepository: Repository<Client>,

    private dataSource: DataSource,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Multer.File,
    @Body() uploadProgressDto: UploadProgressDto,
  ) {

    // Pasamos clientId si está disponible
    const clientId = uploadProgressDto.clientId 
      ? parseInt(uploadProgressDto.clientId.toString(), 10) 
      : undefined;

    return this.UpdateDataService.processExcelFile(file.path, clientId);
  }

  @Post('users-clubs')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'usersFile', maxCount: 1 },
      { name: 'clubsFile', maxCount: 1 }
    ])
  )
  async uploadUsersAndClubs(
    @UploadedFiles() files: { usersFile?: Multer.File[], clubsFile?: Multer.File[] },
    @Body() uploadDto: UploadUsersClubsDto,
  ) {
    if (!files.usersFile || !files.clubsFile) {
      throw new Error('Both usersFile and clubsFile are required');
    }

    // Validate clientId is provided
    if (!uploadDto.clientId) {
      throw new Error('clientId is required');
    }

    const clientId = parseInt(uploadDto.clientId.toString(), 10);
    
    // Validate that parsing was successful
    if (isNaN(clientId)) {
      throw new Error('clientId must be a valid number');
    }
    
    return this.UpdateDataService.processUsersAndClubs(
      files.usersFile[0].path,
      files.clubsFile[0].path,
      clientId // Now guaranteed to be a number
    );
  }

  @Post('upload/update-evaluation-progress')
  @UseInterceptors(FileInterceptor('file'))
  async updateEvaluationProgress(
    @UploadedFile() file: Multer.File,
    @Body() updateDto: UpdateEvaluationProgressDto,
  ) {
    // Validación del archivo
    if (!file) {
      throw new BadRequestException('Se requiere un archivo');
    }

    const allowedMimes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                        'application/vnd.ms-excel', 'text/csv'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Formato de archivo no permitido. Use XLSX, XLS o CSV');
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 50MB');
    }

    try {
      // Verificar que exista la evaluación y esté asociada al club
      const evaluationClub = await this.dataSource.query(`
        SELECT ec.id 
        FROM evaluation_clubs ec 
        WHERE ec.evaluation_id = ? AND ec.club_id = ?
      `, [updateDto.evaluation_id, updateDto.club_id]);

      if (!evaluationClub || evaluationClub.length === 0) {
        throw new BadRequestException('La evaluación no está asociada al club especificado');
      }

      const rowsProcessed = await this.processEvaluationUpdateFile(
        file,
        updateDto.client_id,
        updateDto.club_id,
        updateDto.evaluation_id
      );

      return {
        success: true,
        message: `Actualización de evaluaciones completada. Filas procesadas: ${rowsProcessed}`,
        totalRows: rowsProcessed,
      };
    } catch (error) {
      throw new InternalServerErrorException(`Actualización fallida: ${error.message}`);
    }
  }

  private async processEvaluationUpdateFile(
    file: Multer.File,
    clientId: number,
    clubId: number,
    evaluationId: number
  ): Promise<number> {
    try {
      console.log('Iniciando procesamiento de archivo...');
      console.log('Parámetros:', { clientId, clubId, evaluationId });
      
      // Validar el archivo
      if (!file) {
        throw new BadRequestException('Archivo no proporcionado');
      }
      
      console.log('Información del archivo:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        hasPath: !!file.path,
        hasBuffer: !!file.buffer
      });

      let workbook;
      try {
        // Preferir readFile si hay path disponible
        if (file.path) {
          console.log('Leyendo archivo desde path:', file.path);
          workbook = xlsx.readFile(file.path);
        } else if (file.buffer) {
          console.log('Leyendo archivo desde buffer');
          workbook = xlsx.read(file.buffer, { type: 'buffer' });
        } else {
          throw new BadRequestException('No se encontró ni path ni buffer del archivo');
        }
      } catch (xlsxError) {
        console.error('Error al leer archivo Excel:', xlsxError);
        throw new BadRequestException('No se pudo leer el archivo Excel. Verifique que sea un formato válido (.xlsx, .xls)');
      }
      
      console.log('Workbook leído exitosamente. Hojas:', workbook.SheetNames);
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new BadRequestException('El archivo no contiene hojas válidas');
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet);
      
      console.log('Data parseada:', jsonData?.length, 'filas');
      console.log('Primera fila:', jsonData?.[0]);

      if (!jsonData || jsonData.length === 0) {
        throw new BadRequestException('El archivo no contiene datos válidos');
      }

      // Verificar que exista al menos una fila de datos
      if (!jsonData[0]) {
        throw new BadRequestException('El archivo no contiene filas de datos');
      }

      // Identificar la columna de identificación y fecha
      const headers = Object.keys(jsonData[0]);
      console.log('Headers encontrados:', headers);
      
      if (!headers || headers.length === 0) {
        throw new BadRequestException('No se pudieron leer las columnas del archivo');
      }

      const identificationColumn = this.findIdentificationColumn(headers);
      const dateColumn = this.findDateColumn(headers);
      
      console.log('Columna identificación:', identificationColumn);
      console.log('Columna fecha:', dateColumn);
      
      if (!identificationColumn) {
        throw new BadRequestException('No se encontró una columna de identificación válida (cedula, documento, identificacion, numero de documento)');
      }

      let processedRows = 0;
      const errors: string[] = [];

      console.log('Iniciando procesamiento de', jsonData.length, 'filas');

      for (let index = 0; index < jsonData.length; index++) {
        try {
          const row = jsonData[index];
          console.log(`Procesando fila ${index + 1}:`, row);
          
          const identification = row[identificationColumn];
          console.log('Identificación extraída:', identification);
          
          if (!identification) {
            errors.push(`Fila ${index + 2}: Identificación vacía`);
            continue;
          }

          // Buscar usuario por identificación
          console.log('Buscando usuario con:', { identification, clubId, clientId });
          const user = await this.dataSource.query(`
            SELECT u.id, u.identification 
            FROM users u 
            INNER JOIN club_user uc ON u.id = uc.user_id 
            WHERE u.identification = ? AND uc.club_id = ? AND u.client_id = ?
          `, [identification, clubId, clientId]);

          console.log('Usuario encontrado:', user);

          if (!user || user.length === 0 || !user[0]) {
            errors.push(`Fila ${index + 2}: Usuario con identificación ${identification} no encontrado en el club`);
            continue;
          }

          const userId = user[0].id;
          console.log('User ID:', userId);

          // Obtener datos de las columnas nota, approved, intentos (si existen)
          const nota = row['nota'] || row['calificacion'] || row['puntaje'] || 0;
          const approved = row['approved'] || row['aprobado'] || (nota >= 70 ? 1 : 0);
          const intentos = row['intentos'] || row['attempts'] || 1;

          console.log('Datos evaluación:', { nota, approved, intentos });

          // Obtener fecha del archivo o usar fecha actual
          let evaluationDate = new Date();
          if (dateColumn && row[dateColumn]) {
            const dateValue = this.parseDate(row[dateColumn]);
            if (dateValue) {
              evaluationDate = dateValue;
            }
          }

          const formattedDate = evaluationDate.toISOString().slice(0, 19).replace('T', ' ');
          console.log('Fecha formateada:', formattedDate);

          // Verificar si ya existe registro en evaluation_users
          const existingUser = await this.dataSource.query(`
            SELECT id FROM evaluation_users 
            WHERE evaluation_id = ? AND user_id = ?
          `, [evaluationId, userId]);

          console.log('Usuario existente en evaluación:', existingUser);

          if (existingUser && existingUser.length > 0) {
            // Actualizar registro existente
            await this.dataSource.query(`
              UPDATE evaluation_users 
              SET nota = ?, approved = ?, intentos = ?, updated_at = ?
              WHERE evaluation_id = ? AND user_id = ?
            `, [nota, approved, intentos, formattedDate, evaluationId, userId]);
            console.log('Registro actualizado');
          } else {
            // Crear nuevo registro
            await this.dataSource.query(`
              INSERT INTO evaluation_users (evaluation_id, user_id, nota, approved, intentos, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [evaluationId, userId, nota, approved, intentos, formattedDate, formattedDate]);
            console.log('Registro creado');
          }

          // Insertar en historial
          await this.dataSource.query(`
            INSERT INTO evaluation_history (evaluation_id, user_id, nota, approved, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [evaluationId, userId, nota, approved, formattedDate, formattedDate]);

          console.log('Historial insertado');
          processedRows++;
        } catch (error) {
          console.error(`Error en fila ${index + 2}:`, error);
          errors.push(`Fila ${index + 2}: Error al procesar - ${error.message}`);
        }
      }

      if (errors.length > 0) {
        console.warn('Errores durante el procesamiento:', errors);
      }

      console.log('Procesamiento completado. Filas procesadas:', processedRows);
      return processedRows;
    } catch (error) {
      console.error('Error en processEvaluationUpdateFile:', error);
      throw error;
    }
  }

  // Método auxiliar para encontrar la columna de identificación
  private findIdentificationColumn(headers: string[]): string | null {
    const identificationKeywords = [
      'cedula', 'cédula', 'documento', 'identificacion', 'identificación',
      'numero de documento', 'número de documento', 'num documento',
      'doc', 'id', 'identification', 'document'
    ];

    for (const header of headers) {
      const normalizedHeader = header.toLowerCase().trim();
      if (identificationKeywords.some(keyword => 
        normalizedHeader.includes(keyword.toLowerCase())
      )) {
        return header;
      }
    }

    return null;
  }

  // Método auxiliar para encontrar la columna de fecha
  private findDateColumn(headers: string[]): string | null {
    const dateKeywords = [
      'fecha', 'date', 'created_at', 'updated_at', 'fecha_evaluacion',
      'fecha evaluacion', 'fecha_examen', 'fecha examen', 'fecha_realizacion',
      'fecha realizacion', 'completed_at', 'finished_at', 'timestamp'
    ];

    for (const header of headers) {
      const normalizedHeader = header.toLowerCase().trim();
      if (dateKeywords.some(keyword => 
        normalizedHeader.includes(keyword.toLowerCase())
      )) {
        return header;
      }
    }

    return null;
  }

  // Método auxiliar para parsear fechas
  private parseDate(dateValue: any): Date | null {
    if (!dateValue) return null;

    try {
      // Si es un número (formato Excel serial date)
      if (typeof dateValue === 'number') {
        // Excel date serial number to JavaScript Date
        const excelEpoch = new Date(1900, 0, 1);
        const jsDate = new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000);
        return jsDate;
      }

      // Si es string, intentar parsearlo
      if (typeof dateValue === 'string') {
        // Formatos comunes: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY
        const dateStr = dateValue.trim();
        
        // Intentar con Date constructor primero
        let parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }

        // Intentar formato DD/MM/YYYY o DD-MM-YYYY
        const ddmmyyyyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
        const ddmmMatch = dateStr.match(ddmmyyyyPattern);
        if (ddmmMatch) {
          const [, day, month, year] = ddmmMatch;
          parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
        }

        // Intentar formato YYYY-MM-DD
        const yyyymmddPattern = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
        const yyyymmMatch = dateStr.match(yyyymmddPattern);
        if (yyyymmMatch) {
          const [, year, month, day] = yyyymmMatch;
          parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
        }
      }

      // Si ya es una fecha
      if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        return dateValue;
      }

      return null;
    } catch (error) {
      console.warn('Error parsing date:', dateValue, error);
      return null;
    }
  }


  // Controlador actualizado
  @Post('upload/import')
  @UseInterceptors(FileInterceptor('file'))
  async importUsers(
    @UploadedFile() file: Multer.File,
    @Body() importDto: ImportUsersDto,
  ) {
    // Validación del archivo
    if (!file) {
      throw new BadRequestException('Se requiere un archivo');
    }

    const allowedMimes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                        'application/vnd.ms-excel', 'text/csv'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Formato de archivo no permitido. Use XLSX, XLS o CSV');
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 50MB');
    }

    const clientId = importDto.client_id;
    const userId = importDto.user_id;
    const roleUser: any = importDto.role_user;

    // Manejar selección de clubes
    let clubIds: number[] = [];

    // Si hay filtros seleccionados
    if (importDto.selected_filters) {
      try {
        const filtersData = JSON.parse(importDto.selected_filters);
        
        if (filtersData && filtersData.length > 0) {
          for (const filterData of filtersData) {
            const newClubIds = await this.getClubsByFilterValue(
              filterData.filter_id, 
              filterData.filter_value
            );
            clubIds = [...clubIds, ...newClubIds];
          }
          
          // Eliminar duplicados
          clubIds = [...new Set(clubIds)];
          
          if (clubIds.length === 0) {
            throw new BadRequestException('No se encontraron clubes con los filtros seleccionados');
          }
        }
      } catch (error) {
        throw new BadRequestException('Formato de filtros inválido');
      }
    } else if (importDto.club && importDto.club.length > 0) {
      // Selección directa de clubes
      clubIds = importDto.club;
    } else {
      throw new BadRequestException('Por favor seleccione al menos un club o use un filtro');
    }

    try {
      let totalRows = 0;
      
      // ── Acumuladores para el correo (en memoria, dentro de esta misma petición) ──
      const recipientsMap = new Map<number, { id: number; name: string; email: string }>();
      const newlyEnrolledCourses = new Set<string>();

      // Obtener cliente una sola vez para eficiencia
      const client = await this.clientRepository.findOne({
        where: { id: clientId },
        relations: ['customFields', 'customFields.options']
      });

      if (!client) {
        throw new BadRequestException('Cliente no encontrado');
      }

      // Procesar para cada club
      for (const clubId of clubIds) {
        const club = await this.clubRepository.findOne({ where: { id: clubId } });
        if (!club) {
          console.warn(`Club ID ${clubId} not found during import`);
          continue;
        }
        
        
        // Procesar archivo Excel inmediatamente
        const rowsProcessed = await this.processExcelFile(
          file,
          clubId,
          clientId,
          importDto.section_id ?? 0,
          userId,
          roleUser,
          client,
          // ↓ callback para capturar cada inscripción nueva sin ensuciar processExcelFile
          (user: any) => {
            newlyEnrolledCourses.add(club.title);
            if (!recipientsMap.has(user.id)) {
              recipientsMap.set(user.id, {
                id: user.id,
                name: user.name,
                email: user.email,
            });
            }
          }
        ); 

  totalRows += rowsProcessed;
}

const recipients = Array.from(recipientsMap.values());
const courses = Array.from(newlyEnrolledCourses);

return {
  success: true,
  message: `Importación completada con éxito. Total de filas procesadas: ${totalRows}`,
  totalRows,
  recipients, // 
  courses,    //
};
      
    } catch (error) {
      throw new InternalServerErrorException(`Importación fallida: ${error.message}`);
    }
  }
  
  // Método para obtener clubes por filtro
  private async getClubsByFilterValue(filterId: number, filterValue: string): Promise<number[]> {
    // Implementar lógica para obtener clubes basado en filtro
    const clubs = await this.clubRepository
      .createQueryBuilder('club')
      .innerJoin('club.filters', 'filter')
      .where('filter.id = :filterId', { filterId })
      .andWhere('filter.value = :filterValue', { filterValue })
      .getMany();
      
    return clubs.map(club => club.id);
  }

  private async processExcelFile(
    file: Multer.File,
    clubId: number,
    clientId: number,
    sectionId: number,
    userId: number,
    roleUser: number,
    client: any,
    onNewEnrollment?: (user: any) => void, 
  ): Promise<number> {
    try {
      const workbook = xlsx.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet);
      
      let successCount = 0;
      let errorCount = 0;
      const errors: any[] = [];
      
      console.log(`Iniciando procesamiento de ${jsonData.length} filas`);
      
      for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
        const row = jsonData[rowIndex];
        
        try {
          const result = await this.processRow(row, clubId, clientId, sectionId, userId, roleUser, client);

          if (result.success) {
            console.log(`Fila ${rowIndex + 1}: Usuario procesado exitosamente - ${result.user?.email || result.user?.identification}`);
            successCount++;

            // Solo si esta fila generó una inscripción NUEVA en este club
            if (result.wasNewEnrollment && result.user && onNewEnrollment) {
              onNewEnrollment(result.user);
            }
          } else {
            console.error(`Fila ${rowIndex + 1}: ${result.error}`);
            errorCount++;
            errors.push({ 
              rowNumber: rowIndex + 1, 
              error: result.error,
              rowData: row 
            });
          }
        } catch (unexpectedError) {
          // Capturar errores no manejados por processRow
          console.error(`Fila ${rowIndex + 1}: Error inesperado - ${unexpectedError.message}`);
          errorCount++;
          errors.push({ 
            rowNumber: rowIndex + 1, 
            error: `Error inesperado: ${unexpectedError.message}`,
            rowData: row 
          });
        }
      }
      
      console.log(`Procesamiento completado: ${successCount} exitosos, ${errorCount} errores de ${jsonData.length} filas totales`);
      
      // Opcional: Log de errores para debugging
      if (errors.length > 0) {
        console.log('Errores encontrados:');
        errors.forEach(error => {
          console.log(`  Fila ${error.rowNumber}: ${error.error}`);
        });
      }
      
      return successCount;
      
    } catch (fileError) {
      console.error(`Error al procesar archivo Excel: ${fileError.message}`);
      throw new Error(`Error al procesar archivo: ${fileError.message}`);
    }
  }

  private async processRow(
    row: any,
    clubId: number,
    clientId: number,
    sectionId: number,
    userId: number,
    roleUser: number,
    client: any
  ): Promise<ProcessRowResult> {

    try {
      // Verificar si la fila tiene datos importantes
      const normalizeKey = (key: string) =>
        key
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // quita tildes
          .replace(/\s+/g, '_') // reemplaza espacios por guiones bajos
          .toLowerCase();

      // Función auxiliar para buscar un valor por múltiples claves posibles
      const findValueByKeys = (row: any, possibleKeys: string[]): string | null => {
        for (const key of possibleKeys) {
          if (row[key] && String(row[key]).trim() !== '') {
            return String(row[key]).trim();
          }
        }
        return null;
      };

      // Función auxiliar para buscar un valor por clave normalizada
      const findValueByNormalizedKey = (row: any, targetNormalizedKey: string): string | null => {
        for (const [key, value] of Object.entries(row)) {
          if (normalizeKey(key) === targetNormalizedKey) {
            if (value && String(value).trim() !== '') {
              return String(value).trim();
            }
          }
        }
        return null;
      };

      const importantColumns = [
        'nombre',
        'apellido',
        'correo',
        'email',
        'numero_de_documento',
        'cedula',
        'identification',
        'numero_de_identificacion',
        'contrasena',
        'contraseña',
        'password',
        'clave',
        'pass',
        'charge',
        'cargo',
      ];

      const hasData = Object.keys(row).some(key => {
        const normalizedKey = normalizeKey(key);
        if (!importantColumns.includes(normalizedKey)) return false;

        const value = row[key];
        return value && String(value).trim() !== '';
      });

      
      if (!hasData) {
        console.log('No existen campos importantes en esta fila');
        return { success: false, error: 'No hay campos importantes', user: null };
      }

      // Definir columnas de identificación y email
      const identificationColumns = [
        'numero_de_documento', 'numero_de_identificacion', 'número_de_documento', 
        'cedula', 'documento', 'identification', 'id_number', 'nombre_de_usuario'
      ];
      
      const emailColumns = [
        'correo', 'correo_electronico', 'correo_electrónico',
        'email', 'e-mail', 'mail'
      ];
      
      // Buscar número de documento (usando normalización)
      let numeroDocumento: any = null;
      for (const column of identificationColumns) {
        numeroDocumento = findValueByNormalizedKey(row, column);
        if (numeroDocumento) break;
      }
      
      // Si no se encontró con normalización, intentar búsqueda directa
      if (!numeroDocumento) {
        numeroDocumento = findValueByKeys(row, identificationColumns);
      }
      
      // Buscar email (usando normalización)
      let correo: any = null;
      for (const column of emailColumns) {
        correo = findValueByNormalizedKey(row, column);
        if (correo) break;
      }
      
      // Si no se encontró con normalización, intentar búsqueda directa
      if (!correo) {
        correo = findValueByKeys(row, emailColumns);
      }
      
      // Buscar usuario existente por documento
      let user: any = null;
      try {
        if (numeroDocumento) {
          user = await this.userRepository.findOne({
            where: { identification: numeroDocumento, client_id: clientId }
          });
        }
        
        // Si no se encontró por documento, buscar por email
        if (!user && correo) {
          user = await this.userRepository.findOne({
            where: { email: correo, client_id: clientId }
          });
        }
      } catch (dbError) {
        console.error(`Error al buscar usuario existente: ${dbError.message}`);
        return { success: false, error: `Error de base de datos: ${dbError.message}`, user: null };
      }

      
      // Preparar datos de actualización (usando búsqueda normalizada)
      const updateData: any = {};
      
      // Buscar nombre
      const nombre = findValueByNormalizedKey(row, 'nombre');
      if (nombre) {
        updateData.name = nombre;
      }
      
      // Buscar apellido
      const apellido = findValueByNormalizedKey(row, 'apellido');
      if (apellido) {
        updateData.last_name = apellido;
      }
      
      // Definir los valores válidos del enum
      const VALID_IDENTIFICATION_TYPES = ['AA', 'CC', 'CE', 'PA', 'RC', 'TI'] as const;

      // Función para normalizar el tipo de documento
      const normalizeIdentificationType = (value: string): string | null => {
        if (!value || typeof value !== 'string') return null;
        
        const normalizedValue = value.trim().toUpperCase();
        
        // Verificar si el valor normalizado está en los tipos válidos
        if (VALID_IDENTIFICATION_TYPES.includes(normalizedValue as any)) {
          return normalizedValue;
        }
        
        return null;
      };

      // En tu código de procesamiento:
      const tipoDocumento = findValueByNormalizedKey(row, 'tipo_de_documento');
      if (tipoDocumento) {
        const normalizedType = normalizeIdentificationType(tipoDocumento);
        if (normalizedType) {
          updateData.identification_type = normalizedType as 'AA' | 'CC' | 'CE' | 'PA' | 'RC' | 'TI';
        } else {
          // Manejar el caso donde el tipo no es válido
          console.warn(`Tipo de documento inválido: ${tipoDocumento}`);
          updateData.identification_type = 'CC';
        }
      }
      
      if (numeroDocumento) {
        updateData.identification = numeroDocumento;
      }
      
      // Buscar organización
      const organizacion = findValueByNormalizedKey(row, 'organizacion');
      if (organizacion) {
        updateData.company = organizacion;
      }
      
      // Buscar cargo
      const cargo = findValueByNormalizedKey(row, 'cargo');
      if (cargo) {
        updateData.charge = cargo;
      }

      const fecha_nacimiento = findValueByNormalizedKey(row, 'fecha_de_nacimiento');
      if (fecha_nacimiento) {
        const parsedDate = this.parseDate(fecha_nacimiento);
        if (parsedDate) {
          updateData.registerd_age_user = parsedDate;
        } else {
          console.warn(`Fecha de nacimiento inválida: ${fecha_nacimiento}`);
        }
      }

      const genero = findValueByNormalizedKey(row, 'genero');
      if (genero){
        updateData.registerd_sex_user = genero;
      }
      
      // Buscar contraseña con manejo de errores para bcrypt
      const passwordColumns = ['contrasena', 'contraseña', 'password', 'clave', 'pass'];
      let contrasena: any = null;
      
      for (const column of passwordColumns) {
        contrasena = findValueByNormalizedKey(row, column);
        if (contrasena) break;
      }
      
      // Si no se encontró con normalización, intentar búsqueda directa
      if (!contrasena) {
        contrasena = findValueByKeys(row, passwordColumns);
      }

      if(!user){
        // Si no hay contraseña pero sí hay número de documento, usar el documento como contraseña
        if (!contrasena && numeroDocumento) {
          contrasena = numeroDocumento;
          console.log(`No se encontró contraseña, usando número de documento como contraseña para usuario: ${numeroDocumento}`);
        }
      }
      
      
      if (contrasena) {
        try {
          updateData.password = await bcrypt.hash(contrasena, 10);
        } catch (hashError) {
          console.error(`Error al hashear contraseña: ${hashError.message}`);
          return { success: false, error: `Error al procesar contraseña: ${hashError.message}`, user: null };
        }
      }
      
      // Si es usuario nuevo, agregar email y campos por defecto
      if (!user) {
        if (roleUser === 9) {
          return { success: false, error: 'No se puede crear usuario con rol auditorstudents', user: null };
        }
        
        // Validar que al menos tenga número de documento para crear usuario
        if (!numeroDocumento) {
          return { success: false, error: 'Se requiere número de documento para crear usuario', user: null };
        }
        
        // Validar que tenga contraseña (ya sea explícita o usando el documento)
        if (!updateData.password) {
          return { success: false, error: 'Se requiere contraseña o número de documento para crear usuario', user: null };
        }
        
        // Completar campos faltantes con valores por defecto
        if (!updateData.name) {
          updateData.name = 'Sin datos';
        }
        
        if (!updateData.last_name) {
          updateData.last_name = 'Sin datos';
        }
        
        if (!updateData.identification_type) {
          updateData.identification_type = 'CC'; // Tipo por defecto
        }
        
        if (!updateData.company) {
          updateData.company = 'Sin datos';
        }
        
        if (!updateData.charge) {
          updateData.charge = 'Sin datos';
        }
        
        console.log(`Creando usuario con datos mínimos. Documento: ${numeroDocumento}`);
        
        updateData.email = correo || numeroDocumento;
        updateData.client_id = clientId;
        updateData.creator_id = userId;
      }
      
      if (Object.keys(updateData).length > 0 || correo || numeroDocumento) {
        try {
          let wasNewEnrollment = false;

          await this.dataSource.transaction(async manager => {
            let wasRecentlyCreated = false;
            
            if (!user) {
              // Para usuarios nuevos: establecer fecha de creación y actualización
              const now = new Date();
              // Opcional: Ajustar a zona horaria de Colombia (UTC-5)
              const nowColombia = new Date(now.getTime() - (5 * 60 * 60 * 1000));
              
              updateData.created_at = nowColombia;
              updateData.updated_at = nowColombia;
              
              user = manager.create(User, updateData);
              user.status_validation = '1';
              
              await manager.save(user);
              wasRecentlyCreated = true;
              
              // Asignar rol por defecto solo si es usuario nuevo
              await this.assignDefaultRole(user.id, manager);
            } else {
              // Para usuarios existentes: solo actualizar fecha de actualización
              updateData.updated_at = new Date();
              
              await manager.update(User, { id: user.id }, updateData);
            }
            
            // Procesar campos personalizados
            await this.processUserCustomFields(user, row, client.customFields, manager);
            
            // Asociar club
           // Asociar club (y saber si la inscripción fue nueva)
            wasNewEnrollment = await this.attachUserToClub(user.id, clubId, manager);

            // Asociar a clubes públicos
            // await this.attachPublicClubs(user.id, manager);
            
            // Asociar sección si existe
            if (sectionId) {
              await this.attachUserToSection(user.id, clubId, sectionId, manager);
            }
          });
          
          return { success: true, error: null, user: user, wasNewEnrollment };
        } catch (transactionError) {
          console.error(`Error en transacción de usuario: ${transactionError.message}`);
          return { success: false, error: `Error en transacción: ${transactionError.message}`, user: null };
        }
      }
      
      return { success: false, error: 'No hay datos para procesar', user: null };
      
    } catch (generalError) {
      console.error(`Error general en processRow: ${generalError.message}`);
      return { success: false, error: `Error general: ${generalError.message}`, user: null };
    }
  }

  private async processUserCustomFields(user: any, row: any, customFields: any[], manager: any) {
    for (const customField of customFields) {
      const fieldKey = customField.name.toLowerCase().replace(/ /g, '_');
      
      // Buscar clave coincidente en la fila
      const matchingRowKey = Object.keys(row).find(key => 
        key.toLowerCase().replace(/ /g, '_') === fieldKey
      );
      
      if (matchingRowKey && row[matchingRowKey] && String(row[matchingRowKey]).trim() !== '') {
        const fieldValue = String(row[matchingRowKey]).trim();
        
        switch (customField.fieldType) {
          case 'select':
            const matchingOption = customField.options.find(option => 
              option.optionValue.toLowerCase() === fieldValue.toLowerCase()
            );
            
            if (matchingOption) {
              await this.saveUserCustomField(user.id, customField.id, matchingOption.id, manager);
            }
            break;
            
          case 'text':
            await this.saveUserCustomField(user.id, customField.id, fieldValue, manager);
            break;
          case 'textarea':
            await this.saveUserCustomField(user.id, customField.id, fieldValue, manager);
            break;
          default:
            if (fieldValue) {
              await this.saveUserCustomField(user.id, customField.id, fieldValue, manager);
            }
            break;
        }
      }
    }
  }

  private async saveUserCustomField(userId: number, customFieldId: number, value: any, manager: any) {
    await manager.query(`
      INSERT INTO user_custom_fields (user_id, custom_field_id, value) 
      VALUES (?, ?, ?) 
      ON DUPLICATE KEY UPDATE value = VALUES(value)
    `, [userId, customFieldId, value]);
  }

  private async attachUserToClub(userId: number, clubId: number, manager: any): Promise<boolean> {
  const result = await manager.query(`
    INSERT IGNORE INTO club_user (user_id, club_id) 
    VALUES (?, ?)
  `, [userId, clubId]);
  // MySQL: affectedRows = 1 si insertó, 0 si el duplicado fue ignorado
  return result?.affectedRows === 1;
}

  // private async attachPublicClubs(userId: number, manager: any) {
  //   // Obtener clubes públicos y asociarlos al usuario
  //   await manager.query(`
  //     INSERT IGNORE INTO club_user (user_id, club_id)
  //     SELECT ?, id FROM clubs WHERE public = 1
  //   `, [userId]);
  // }

  private async attachUserToSection(userId: number, clubId: number, sectionId: number, manager: any) {
    await manager.query(`
      INSERT INTO detail_user_sections_clubs (user_id, club_id, section_id) 
      VALUES (?, ?, ?) 
      ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
    `, [userId, clubId, sectionId]);
  }

  private async assignDefaultRole(userId: number, manager: any) {
    // Asignar rol por defecto (ID 2)
    await manager.query(`
      INSERT IGNORE INTO role_user (user_id, role_id) 
      VALUES (?, 2)
    `, [userId]);
  }



  @Post('delete-from-clubs')
  async deleteUsersFromClubs(@Body() deleteRequest: DeleteUsersRequest): Promise<ProcessResult> {
    try {

      var idClient = deleteRequest.clientId;

      console.log('clientId:', idClient);

      // Validar que existan clubs
      if (!deleteRequest.clubs || deleteRequest.clubs.length === 0) {
        throw new HttpException('No se especificaron clubs válidos', HttpStatus.BAD_REQUEST);
      }

      // Convertir clubs a números
      const clubIds = deleteRequest.clubs.map(clubId => {
        const numericId = typeof clubId === 'string' ? parseInt(clubId, 10) : clubId;
        if (isNaN(numericId)) {
          throw new HttpException(`ID de club inválido: ${clubId}`, HttpStatus.BAD_REQUEST);
        }
        return numericId;
      });

      console.log('🏢 Club IDs convertidos:', clubIds);

      // Validar que existan clubs en la base de datos
      const existingClubs = await this.clubRepository.findBy({
        id: In(clubIds) // Usar los IDs convertidos a números
      });

      console.log('🏢 Clubs existentes:', existingClubs);

      if (existingClubs.length !== deleteRequest.clubs.length) {
        throw new HttpException('Algunos clubs especificados no existen', HttpStatus.BAD_REQUEST);
      }

      // Validar que existan usuarios
      if (!deleteRequest.users || deleteRequest.users.length === 0) {
        throw new HttpException('No se especificaron usuarios para procesar', HttpStatus.BAD_REQUEST);
      }

      let totalProcessed = 0;
      let totalRemoved = 0;
      const errors: string[] = [];

      // Procesar cada usuario individualmente
      for (const userData of deleteRequest.users) {
        try {
          totalProcessed++;
          
          // Intentar identificar al usuario
          const user = await this.identifyUser(userData, idClient);

          console.log(`🔍 Identificando usuario: ${this.getUserDescription(userData)}`);

          console.log(`usuario ${user ? user.id : 'no encontrado'}`);
          
          if (!user) {
            errors.push(`No se pudo identificar al usuario: ${this.getUserDescription(userData)}`);
            continue;
          }

          // Eliminar las relaciones con los clubs especificados
          for (const clubId of deleteRequest.clubs) {
            try {
              const deleteResult = await this.clubUserRepository.delete({
                user_id: user.id,
                club_id: clubId,
              });

              console.log(`🗑️ Eliminando usuario ${user.identification || user.email} del club ${clubId}:`, deleteResult);
              if (deleteResult.affected && deleteResult.affected > 0) {
                totalRemoved += deleteResult.affected;
              }
            } catch (clubError) {
              errors.push(`Error al eliminar usuario ${user.identification || user.email} del club ${clubId}: ${clubError.message}`);
            }
          }

        } catch (userError) {
          errors.push(`Error procesando usuario: ${this.getUserDescription(userData)} - ${userError.message}`);
        }
      }

      // Generar respuesta
      const successMessage = `Proceso completado. Se procesaron ${totalProcessed} registros y se eliminaron ${totalRemoved} relaciones de usuarios con clubs.`;

      return {
        totalProcessed,
        totalRemoved,
        errors,
        success: true,
        message: successMessage,
      };

    } catch (error) {
      console.error('Error al eliminar usuarios de clubs:', error);
      
      return {
        totalProcessed: 0,
        totalRemoved: 0,
        errors: [`Error general: ${error.message}`],
        success: false,
        message: 'Ha ocurrido un error al procesar la solicitud',
      };
    }
  }

  private async identifyUser(userData: UserData, idClient): Promise<User | null> {
    // Buscar por número de identificación/cédula
    const identificationFields = [
      'cedula', 
      'numero_de_identificacion', 
      'numero de identificacion',
      'documento', 
      'numero_de_cedula', 
      'numero de cedula', 
      'numero_de_documento',
      'numero de documento',
      'numero de identificación'
    ];

    for (const field of identificationFields) {
      if (userData[field]) {
        const identificationValue = this.normalizeIdentificationValue(userData[field]);

        console.log(identificationValue);
        console.log(userData[field]);
        const user = await this.userRepository.findOne({
          where: { identification: identificationValue, client_id: idClient }
        });
        console.log(`🔍 Buscando usuario por ${field}: ${identificationValue}`);
        console.log('usuario encontrado:', user);
        if (user) return user;
      }
    }

    // Buscar por email
    // const emailFields = ['email', 'correo'];
    // for (const field of emailFields) {
    //   if (userData[field]) {
    //    const emailValue = this.normalizeEmail(userData[field]);
    //    const user = await this.userRepository.findOne({
    //      where: { email: emailValue }
    //    });
    //    if (user) return user;
    //  }
    //}

    return null;
  }

  private normalizeIdentificationValue(value: any): string {
    if (value === null || value === undefined) return '';
    
    // Convertir a string y limpiar
    return String(value)
      .replace(/\D/g, '') // Quitar caracteres no numéricos
      .trim();
  }

  private normalizeEmail(value: any): string {
    if (value === null || value === undefined) return '';
    
    return String(value)
      .toLowerCase()
      .trim();
  }

  private getUserDescription(userData: UserData): string {
    const identificationFields = [
      'cedula', 
      'numero_identificacion', 
      'documento', 
      'numero_de_cedula', 
      'numero_de_documento',
      'email',
      'correo'
    ];

    for (const field of identificationFields) {
      if (userData[field]) {
        return `${field}: ${userData[field]}`;
      }
    }

    // Si no hay campos de identificación, mostrar los primeros campos disponibles
    const availableFields = Object.entries(userData)
      .filter(([key, value]) => value !== null && value !== undefined && value !== '')
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    return availableFields || 'Usuario sin identificación válida';
  }
}