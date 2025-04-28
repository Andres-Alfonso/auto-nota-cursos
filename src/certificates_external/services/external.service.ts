// import { Injectable, Logger } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository, Connection } from 'typeorm';

// import * as fs from 'fs';
// import * as path from 'path';
// import * as ExcelJS from 'exceljs';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class ExternalService {
//   private readonly logger = new Logger(ExternalService.name);
  
//   constructor(
//     private connection: Connection,
//     private configService: ConfigService,
//   ) {}


//   async findCertificateExternals(clientId: number): Promise<void> {
//     try {
//       this.logger.warn(`Iniciando análisis para cliente ${clientId}`);
  
//       const sameClientCerts = await this.countCertificatesByClientUsers(clientId);
//       this.logger.log(`Certificados asociados a usuarios del cliente ${clientId}: ${sameClientCerts}`);
  
//       const otherClientCerts = await this.countCertificatesWithDifferentClientSnapshot(clientId);
//       this.logger.log(`Certificados con snapshot de cliente diferente a ${clientId}: ${otherClientCerts}`);
  
//       const updated = await this.fixUserIdsForDuplicateIdentifications(clientId);
//       this.logger.log(`Certificados actualizados con nuevo user_id: ${updated}`);
  
//     } catch (error) {
//       this.logger.error(`Error en findCertificateExternals: ${error.message}`, error.stack);
//       throw error;
//     }
//   }

//   private async countCertificatesByClientUsers(clientId: number): Promise<number> {
//     const query = `
//       SELECT COUNT(*) as total
//       FROM user_certificates uc
//       INNER JOIN users u ON uc.user_id = u.id
//       WHERE u.client_id = ?
//     `;
//     const result = await this.connection.query(query, [clientId]);
//     return result[0]?.total || 0;
//   }

//   private async countCertificatesWithDifferentClientSnapshot(clientId: number): Promise<number> {
//     const query = `
//       SELECT COUNT(*) as total
//       FROM user_certificates
//       WHERE user_snapshot LIKE '%"client_id":%' 
//         AND user_snapshot NOT LIKE ?
//     `;
//     const likePattern = `%"client_id": ${clientId}%`;
//     const result = await this.connection.query(query, [likePattern]);
//     return result[0]?.total || 0;
//   }

//   private async fixUserIdsForDuplicateIdentifications(clientId: number): Promise<number> {
//     const query = `
//       SELECT uc.id as certificate_id, uc.user_id as current_user_id, u2.id as correct_user_id
//       FROM user_certificates uc
//       JOIN users u1 ON uc.user_id = u1.id
//       JOIN users u2 ON u1.identification = u2.identification AND u2.client_id = ?
//       WHERE u1.client_id != ?
//         AND u1.identification IS NOT NULL
//         AND u2.id != u1.id
//     `;
  
//     const rows = await this.connection.query(query, [clientId, clientId]);
  
//     let updatedCount = 0;
  
//     for (const row of rows) {
//       await this.connection.query(`
//         UPDATE user_certificates
//         SET user_id = ?
//         WHERE id = ?
//       `, [row.correct_user_id, row.certificate_id]);
//       updatedCount++;
//     }
  
//     return updatedCount;
//   }

// }


import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';

import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import * as moment from 'moment';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExternalService {
  private readonly logger = new Logger(ExternalService.name);
  
  constructor(
    private connection: Connection,
    private configService: ConfigService,
  ) {}


  async findCertificateExternals(clientId: number): Promise<void> {
    try {
      this.logger.warn(`Iniciando análisis para cliente ${clientId}`);
  
      const sameClientCerts = await this.countCertificatesByClientUsers(clientId);
      this.logger.log(`Certificados asociados a usuarios del cliente ${clientId}: ${sameClientCerts}`);
  
      const otherClientCerts = await this.countCertificatesWithDifferentClientSnapshot(clientId);
      this.logger.log(`Certificados con snapshot de cliente diferente a ${clientId}: ${otherClientCerts}`);
  
      const updated = await this.fixUserIdsForDuplicateIdentifications(clientId);
      this.logger.log(`Certificados actualizados con nuevo user_id: ${updated}`);
  
    } catch (error) {
      this.logger.error(`Error en findCertificateExternals: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Método de prueba que sólo muestra los resultados sin ejecutar actualizaciones
   */
  async testCertificateExternals(clientId: number): Promise<any> {
    try {
      this.logger.warn(`Iniciando análisis de prueba para cliente ${clientId}`);
  
      const sameClientCerts = await this.countCertificatesByClientUsers(clientId);
      this.logger.log(`Certificados asociados a usuarios del cliente ${clientId}: ${sameClientCerts}`);
  
      const otherClientCerts = await this.countCertificatesWithDifferentClientSnapshot(clientId);
      this.logger.log(`Certificados con snapshot de cliente diferente a ${clientId}: ${otherClientCerts}`);
  
      // Solo obtener los datos sin actualizar
      const certificatesToFix = await this.getCertificatesForDuplicateIdentifications(clientId);
      this.logger.log(`Se encontraron ${certificatesToFix.length} certificados que se podrían actualizar`);
  
      return {
        sameClientCerts,
        otherClientCerts,
        certificatesToFix: certificatesToFix.slice(0, 100) // Limitar a 100 para evitar respuestas muy grandes
      };
    } catch (error) {
      this.logger.error(`Error en testCertificateExternals: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async countCertificatesByClientUsers(clientId: number): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM user_certificates uc
      INNER JOIN users u ON uc.user_id = u.id
      WHERE u.client_id = ?
    `;
    const result = await this.connection.query(query, [clientId]);
    return result[0]?.total || 0;
  }

  private async countCertificatesWithDifferentClientSnapshot(clientId: number): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM user_certificates
      WHERE user_snapshot LIKE '%"client_id":%' 
        AND user_snapshot NOT LIKE ?
    `;
    const likePattern = `%"client_id": ${clientId}%`;
    const result = await this.connection.query(query, [likePattern]);
    return result[0]?.total || 0;
  }

  /**
   * Método que solo obtiene los certificados que se podrían modificar, sin hacer cambios
   */
  private async getCertificatesForDuplicateIdentifications(clientId: number): Promise<any[]> {
    const query = `
      SELECT 
        uc.id as certificate_id, 
        uc.user_id as current_user_id, 
        u1.identification,
        u1.name as current_user_name,
        u1.client_id as current_client_id,
        u2.id as correct_user_id,
        u2.name as correct_user_name
      FROM user_certificates uc
      JOIN users u1 ON uc.user_id = u1.id
      JOIN users u2 ON u1.identification = u2.identification AND u2.client_id = ?
      WHERE u1.client_id != ?
        AND u1.identification IS NOT NULL
        AND u2.id != u1.id
    `;
    
    return await this.connection.query(query, [clientId, clientId]);
  }

  private async fixUserIdsForDuplicateIdentifications(clientId: number): Promise<number> {
    const query = `
      SELECT uc.id as certificate_id, uc.user_id as current_user_id, u2.id as correct_user_id
      FROM user_certificates uc
      JOIN users u1 ON uc.user_id = u1.id
      JOIN users u2 ON u1.identification = u2.identification AND u2.client_id = ?
      WHERE u1.client_id != ?
        AND u1.identification IS NOT NULL
        AND u2.id != u1.id
    `;
  
    const rows = await this.connection.query(query, [clientId, clientId]);
  
    let updatedCount = 0;
  
    for (const row of rows) {
      await this.connection.query(`
        UPDATE user_certificates
        SET user_id = ?
        WHERE id = ?
      `, [row.correct_user_id, row.certificate_id]);
      updatedCount++;
    }
  
    return updatedCount;
  }

  /**
   * Sincroniza documentos y certificados para un usuario específico
   * Busca certificados en user_certificates y verifica si hay documentos con el mismo nombre
   * Si el usuario no está asociado al documento, lo agrega
   * @param userId ID del usuario a sincronizar
   */
  async syncUserCertificatesWithDocuments(userId: number): Promise<any> {
    try {
      this.logger.warn(`Iniciando sincronización de certificados y documentos para usuario ${userId}`);
      
      // Obtener los certificados del usuario
      const userCertificates = await this.getUserCertificates(userId);
      this.logger.log(`Se encontraron ${userCertificates.length} certificados para el usuario ${userId}`);
      
      let addedAssociations = 0;
      let alreadyAssociated = 0;
      let noMatchingDocuments = 0;
      const details: any[] = [];

      // Para cada certificado, buscar documentos con el mismo nombre
      for (const certificate of userCertificates) {
        const documentsWithSameName = await this.findDocumentsWithSameName(certificate.name);
        
        if (documentsWithSameName.length === 0) {
          noMatchingDocuments++;
          details.push({
            certificateId: certificate.id,
            certificateName: certificate.name,
            status: 'no_matching_document'
          });
          continue;
        }
        
        // Para cada documento encontrado, verificar si el usuario ya está asociado
        for (const document of documentsWithSameName) {
          const isUserAssociated = await this.isUserAssociatedWithDocument(userId, document.id);
          
          if (!isUserAssociated) {
            // Agregar la asociación
            await this.addUserToDocument(userId, document.id);
            addedAssociations++;
            details.push({
              certificateId: certificate.id,
              certificateName: certificate.name,
              documentId: document.id,
              documentName: document.name,
              status: 'association_added'
            });
          } else {
            alreadyAssociated++;
            details.push({
              certificateId: certificate.id,
              certificateName: certificate.name,
              documentId: document.id,
              documentName: document.name,
              status: 'already_associated'
            });
          }
        }
      }
      
      return {
        userId,
        totalCertificates: userCertificates.length,
        addedAssociations,
        alreadyAssociated,
        noMatchingDocuments,
        details: details.slice(0, 100) // Limitar detalles a 100 para evitar respuestas muy grandes
      };
    } catch (error) {
      this.logger.error(`Error en syncUserCertificatesWithDocuments: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Versión de prueba que muestra los resultados sin hacer cambios reales
   */
  async testSyncUserCertificatesWithDocuments(userId: number): Promise<any> {
    try {
      this.logger.warn(`Iniciando PRUEBA de sincronización para usuario ${userId}`);
      
      // Obtener los certificados del usuario
      const userCertificates = await this.getUserCertificates(userId);
      this.logger.log(`Se encontraron ${userCertificates.length} certificados para el usuario ${userId}`);
      
      let wouldAddAssociations = 0;
      let alreadyAssociated = 0;
      let noMatchingDocuments = 0;
      const details: any[] = [];

      // Para cada certificado, buscar documentos con el mismo nombre
      for (const certificate of userCertificates) {
        const documentsWithSameName = await this.findDocumentsWithSameName(certificate.name);
        
        if (documentsWithSameName.length === 0) {
          noMatchingDocuments++;
          details.push({
            certificateId: certificate.id,
            certificateName: certificate.name,
            status: 'no_matching_document'
          });
          continue;
        }
        
        // Para cada documento encontrado, verificar si el usuario ya está asociado
        for (const document of documentsWithSameName) {
          const isUserAssociated = await this.isUserAssociatedWithDocument(userId, document.id);
          
          if (!isUserAssociated) {
            wouldAddAssociations++;
            details.push({
              certificateId: certificate.id,
              certificateName: certificate.name,
              documentId: document.id,
              documentName: document.name,
              status: 'would_add_association'
            });
          } else {
            alreadyAssociated++;
            details.push({
              certificateId: certificate.id,
              certificateName: certificate.name,
              documentId: document.id,
              documentName: document.name,
              status: 'already_associated'
            });
          }
        }
      }
      
      return {
        userId,
        totalCertificates: userCertificates.length,
        wouldAddAssociations,
        alreadyAssociated,
        noMatchingDocuments,
        details: details.slice(0, 100) // Limitar detalles a 100 para evitar respuestas muy grandes
      };
    } catch (error) {
      this.logger.error(`Error en testSyncUserCertificatesWithDocuments: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtiene los certificados de un usuario desde la tabla user_certificates
   */
  private async getUserCertificates(userId: number): Promise<any[]> {
    try {
      // Consulta adaptada a la estructura real de la tabla
      const query = `
        SELECT uc.id, uc.user_id, uc.name
        FROM user_certificates uc
        WHERE uc.user_id = ? AND uc.status = 'active'
      `;
      
      return await this.connection.query(query, [userId]);
    } catch (error) {
      this.logger.error(`Error al obtener certificados del usuario: ${error.message}`, error.stack);
      return [];
    }
  }
  
  /**
   * Busca documentos con el mismo nombre en la tabla documents
   */
  private async findDocumentsWithSameName(name: string): Promise<any[]> {
    const query = `
      SELECT id, name, client_id, type_document_category
      FROM documents
      WHERE name = ?
    `;
    
    return await this.connection.query(query, [name]);
  }
  
  /**
   * Verifica si un usuario ya está asociado a un documento en la tabla document_user
   */
  private async isUserAssociatedWithDocument(userId: number, documentId: number): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM document_user
      WHERE user_id = ? AND documents_id = ?
    `;
    
    const result = await this.connection.query(query, [userId, documentId]);
    return result[0]?.count > 0;
  }
  
  /**
   * Agrega un usuario a un documento en la tabla document_user
   */
  private async addUserToDocument(userId: number, documentId: number): Promise<void> {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    
    const query = `
      INSERT INTO document_user (user_id, documents_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `;
    
    await this.connection.query(query, [userId, documentId, now, now]);
  }
  
  /**
   * Busca todos los usuarios que tienen certificados pero no están asociados a los documentos correspondientes
   */
  async findUsersWithCertificatesButNoDocuments(): Promise<any[]> {
    const query = `
      SELECT DISTINCT uc.user_id
      FROM user_certificates uc
      JOIN certificates c ON uc.certificate_id = c.id
      WHERE EXISTS (
        SELECT 1 FROM documents d WHERE d.name = c.name
      )
      AND NOT EXISTS (
        SELECT 1 
        FROM document_user du 
        JOIN documents d ON du.documents_id = d.id 
        WHERE du.user_id = uc.user_id AND d.name = c.name
      )
    `;
    
    return await this.connection.query(query);
  }
  
  /**
   * Sincroniza certificados y documentos para todos los usuarios que tienen discrepancias
   */
  async syncAllUserCertificatesWithDocuments(): Promise<any> {
    try {
      const usersToSync = await this.findUsersWithCertificatesButNoDocuments();
      this.logger.warn(`Se encontraron ${usersToSync.length} usuarios para sincronizar`);
      
      const results: {
        totalUsers: number,
        processedUsers: number,
        totalAddedAssociations: number,
        userDetails: Array<{userId: number, addedAssociations: number}>
      } = {
        totalUsers: usersToSync.length,
        processedUsers: 0,
        totalAddedAssociations: 0,
        userDetails: []
      };
      
      for (const userRow of usersToSync) {
        const userId = userRow.user_id;
        const userResult = await this.syncUserCertificatesWithDocuments(userId);
        
        results.processedUsers++;
        results.totalAddedAssociations += userResult.addedAssociations;
        
        if (userResult.addedAssociations > 0) {
          results.userDetails.push({
            userId,
            addedAssociations: userResult.addedAssociations
          });
        }
        
        // Logging de progreso cada 10 usuarios
        if (results.processedUsers % 10 === 0) {
          this.logger.log(`Progreso: ${results.processedUsers}/${results.totalUsers} usuarios procesados`);
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Error en syncAllUserCertificatesWithDocuments: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Sincroniza documentos y certificados para todos los usuarios de un cliente específico
   * @param clientId ID del cliente cuyos usuarios se sincronizarán
   */
  async syncClientCertificatesWithDocuments(clientId: number): Promise<any> {
    try {
      this.logger.warn(`Iniciando sincronización de certificados y documentos para el cliente ${clientId}`);
      
      // Obtener todos los usuarios del cliente
      const clientUsers = await this.getUsersByClientId(clientId);
      this.logger.log(`Se encontraron ${clientUsers.length} usuarios para el cliente ${clientId}`);
      
      const results: {
        clientId: number,
        totalUsers: number,
        processedUsers: number,
        totalAddedAssociations: number,
        userDetails: Array<{userId: number, userName: string, addedAssociations: number}>
      } = {
        clientId,
        totalUsers: clientUsers.length,
        processedUsers: 0,
        totalAddedAssociations: 0,
        userDetails: []
      };
      
      for (const userRow of clientUsers) {
        const userId = userRow.id;
        const userResult = await this.syncUserCertificatesWithDocuments(userId);
        
        results.processedUsers++;
        results.totalAddedAssociations += userResult.addedAssociations;
        
        if (userResult.addedAssociations > 0) {
          results.userDetails.push({
            userId,
            userName: userRow.name,
            addedAssociations: userResult.addedAssociations
          });
        }
        
        // Logging de progreso cada 10 usuarios
        if (results.processedUsers % 10 === 0) {
          this.logger.log(`Progreso: ${results.processedUsers}/${results.totalUsers} usuarios procesados`);
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Error en syncClientCertificatesWithDocuments: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Versión de prueba que muestra qué asociaciones se crearían para los usuarios de un cliente
   * sin realizar cambios reales
   * @param clientId ID del cliente cuyos usuarios se analizarán
   */
  async testSyncClientCertificatesWithDocuments(clientId: number): Promise<any> {
    try {
      this.logger.warn(`Iniciando PRUEBA de sincronización para el cliente ${clientId}`);
      
      // Obtener todos los usuarios del cliente
      const clientUsers = await this.getUsersByClientId(clientId);
      this.logger.log(`Se encontraron ${clientUsers.length} usuarios para el cliente ${clientId}`);
      
      const results: {
        clientId: number,
        totalUsers: number,
        processedUsers: number,
        totalWouldAddAssociations: number,
        userDetails: Array<{
          userId: number, 
          userName: string, 
          wouldAddAssociations: number,
          certificates?: any[]
        }>
      } = {
        clientId,
        totalUsers: clientUsers.length,
        processedUsers: 0,
        totalWouldAddAssociations: 0,
        userDetails: []
      };
      
      // Para limitar el procesamiento, podemos analizar solo una muestra de usuarios en el modo de prueba
      const usersToProcess = clientUsers.length > 100 ? clientUsers.slice(0, 100) : clientUsers;
      
      for (const userRow of usersToProcess) {
        const userId = userRow.id;
        const userResult = await this.testSyncUserCertificatesWithDocuments(userId);
        
        results.processedUsers++;
        results.totalWouldAddAssociations += userResult.wouldAddAssociations;
        
        if (userResult.wouldAddAssociations > 0) {
          results.userDetails.push({
            userId,
            userName: userRow.name,
            wouldAddAssociations: userResult.wouldAddAssociations,
            certificates: userResult.details.filter(d => d.status === 'would_add_association').slice(0, 5) // Mostrar hasta 5 certificados por usuario
          });
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Error en testSyncClientCertificatesWithDocuments: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Obtiene todos los usuarios de un cliente específico
   */
  private async getUsersByClientId(clientId: number): Promise<any[]> {
    const query = `
      SELECT id, name, email
      FROM users
      WHERE client_id = ?
    `;
    
    return await this.connection.query(query, [clientId]);
  }
}