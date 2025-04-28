import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Club } from './progress-users/entities/club.entity';
import { ClubTranslation } from './progress-users/entities/club_translations.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(Club)
    private clubRepository: Repository<Club>,
    @InjectRepository(ClubTranslation)
    private translationRepository: Repository<ClubTranslation>,
  ) {}

  async findAll(locale: string = 'es'): Promise<any[]> {
    // Método 1: Usando relaciones
    const clubs = await this.clubRepository.find({
      relations: ['translations'],
    });

    // Procesar y formatear los resultados para incluir el título traducido
    return clubs.map(club => {
      const translation = club.translations?.find(t => t.locale === locale) || club.translations?.[0];
      return {
        id: club.id,
        name: club.name,
        title: translation?.title || club.name, // Usar el nombre como fallback
      };
    });

    // Método 2 (Alternativo): Usando una consulta personalizada
    /*
    return this.translationRepository
      .createQueryBuilder('translation')
      .select('club.id', 'id')
      .addSelect('club.name', 'name')
      .addSelect('translation.title', 'title')
      .innerJoin('translation.club', 'club')
      .where('translation.locale = :locale', { locale })
      .getRawMany();
    */
  }

  async findByClientId(clientId: number, locale: string = 'es'): Promise<any[]> {
    // Buscar clubes por client_id
    const clubs = await this.clubRepository.find({
      where: { client_id: clientId },
      order: { name: 'ASC' },
      relations: ['translations'],
    });

    // Formatear los resultados como en findAll
    return clubs.map(club => {
      const translation = club.translations?.find(t => t.locale === locale) || club.translations?.[0];
      return {
        id: club.id,
        name: club.name,
        title: translation?.title || club.name,
        client_id: club.client_id
      };
    });
  }
}