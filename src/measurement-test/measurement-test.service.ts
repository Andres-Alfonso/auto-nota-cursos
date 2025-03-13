import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { CreateMeasurementTestDto } from './dto/create-measurement-test.dto';
import { UpdateMeasurementTestDto } from './dto/update-measurement-test.dto';
import { MeasurementTest } from './entities/measurement-test.entity';
import { MeasurementTestDimension } from './entities/measurement-test-dimension.entity';
import { MeasurementTestQuestion } from './entities/measurement-test-question.entity';
import { MeasurementTestOption } from './entities/measurement-test-option.entity';

@Injectable()
export class MeasurementTestService {

  private readonly logger = new Logger(MeasurementTestService.name);
  
  constructor(
    @InjectRepository(MeasurementTest)
    private measurementRepository: Repository<MeasurementTest>,
    
    @InjectRepository(MeasurementTestDimension)
    private dimensionRepository: Repository<MeasurementTestDimension>,
    
    @InjectRepository(MeasurementTestQuestion)
    private questionRepository: Repository<MeasurementTestQuestion>,
    
    @InjectRepository(MeasurementTestOption)
    private optionRepository: Repository<MeasurementTestOption>,
    
    private dataSource: DataSource,
  ) { }

  async processExcelFile(filePath: string, measurement_id: number): Promise<any> {
    try {
      // Verificar que el club existe
      const measurement = await this.measurementRepository.findOneBy({ id: measurement_id });
      if (!measurement) {
        throw new HttpException('Test no encontrado', HttpStatus.NOT_FOUND);
      }

      // Leer el archivo Excel
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      let successCount = 0;
      let errorCount = 0;
      let errors: { row: number; dimension: string; hypothesis: string; error: string }[] = [];


      const headers = rows.shift(); // Remueve la primera fila y la usa como encabezados
      const indexMap = headers.reduce((acc, header, index) => {
          acc[header.trim()] = index;
          return acc;
      }, {});

      // Mapeo de dimensiones para reutilizarlas
      const dimensionsMap = new Map<string, MeasurementTestDimension>();

      // Procesar cada fila
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        
        try {
          const numberHypothesis = parseInt(row[indexMap['NUM']], 10);
          const dimensionName = row[indexMap['DIMENSION']]?.toString().trim();
          const hypothesis = row[indexMap['HIPOTESIS']]?.toString().trim();
          const recoNegative = row[indexMap['RECOMENDACION NEGATIVA']]?.toString().trim();
          const recoIntermediate = row[indexMap['RECOMENDACION INTERMEDIA']]?.toString().trim();
          const recoPositive = row[indexMap['RECOMENDACION POSITIVA']]?.toString().trim();
          const descripHypothesis = row[indexMap['DESCRIPCION DE HIPOTESIS']]?.toString().trim();

          // Validar datos requeridos
          if (!dimensionName || !hypothesis) {
            throw new Error('Dimensión o hipótesis faltante');
          }

          await this.dataSource.transaction(async (manager) => {
            // Buscar o crear la dimensión
            let dimension: MeasurementTestDimension;
            
            if (dimensionsMap.has(dimensionName)) {
              const cachedDimension = dimensionsMap.get(dimensionName);
              if (cachedDimension) {
                dimension = cachedDimension;
              } else {
                throw new Error(`Dimensión en caché inválida para: ${dimensionName}`);
              }
            } else {
              // Buscar si ya existe la dimensión
              const existingDimension = await manager.getRepository(MeasurementTestDimension).findOne({
                where: {
                  measurement_id: measurement_id,
                  title: dimensionName
                }
              });

              // Si no existe, crear nueva dimensión
              if (!existingDimension) {
                const newDimension = manager.getRepository(MeasurementTestDimension).create({
                  measurement_id: measurement_id,
                  title: dimensionName,
                  description: `${dimensionName}`
                });
                
                dimension = await manager.getRepository(MeasurementTestDimension).save(newDimension);
              } else {
                dimension = existingDimension;
              }
              // Guardar en el mapa para reutilizar
              dimensionsMap.set(dimensionName, dimension);
            }

            // Crear la pregunta (hipótesis)
            const question = manager.getRepository(MeasurementTestQuestion).create({
              dimensions_measurement_id: dimension.id,
              question: hypothesis,
              description: descripHypothesis || '',
              positiveRecommendation: recoPositive || '',
              intermediateRecommendation: recoIntermediate || '',
              negativeRecommendation: recoNegative || '',
              dimension: dimension
            });

            const savedQuestion = await manager.getRepository(MeasurementTestQuestion).save(question);
            
            // Aquí puedes añadir la lógica para crear opciones predefinidas si es necesario
            // Por ejemplo, opciones en escala Likert 1-4
            const optionValues = [
              { text: 'Totalmente de acuerdo', score: 4 },
              { text: 'De acuerdo', score: 3 },
              { text: 'En desacuerdo', score: 2 },
              { text: 'Totalmente en desacuerdo', score: 1 }
            ];
            
            for (const optionValue of optionValues) {
              const option = manager.getRepository(MeasurementTestOption).create({
                question_measurement_id: savedQuestion.id,
                optionText: optionValue.text,
                score: optionValue.score,
                question: savedQuestion
              });
              
              await manager.getRepository(MeasurementTestOption).save(option);
            }
          });

          successCount++;
        } catch (error) {
          errorCount++;
          this.logger.error(`Error en la fila ${rowIndex + 2}: ${error.message}`);
          errors.push({
            row: rowIndex + 2,
            dimension: row[indexMap['DIMENSION']]?.toString().trim() || 'N/A',
            hypothesis: row[indexMap['HIPOTESIS']]?.toString().trim() || 'N/A',
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        message: 'Proceso de importación completado',
        stats: {
          total: rows.length,
          successful: successCount,
          failed: errorCount
        },
        errors: errors
      };
      
    } catch (error) {
      this.logger.error(`Error al procesar el archivo Excel: ${error.message}`);
      throw new HttpException(
        `Error al procesar el archivo: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}