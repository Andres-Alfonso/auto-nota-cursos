import { Controller, Get, Render, Req, Query, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { Request } from 'express';

@Controller('ve')
export class AppController {
  constructor(private readonly appService: AppService){}

  @Get()
  @Render('main/index')
  async root(@Req() request: Request, @Query('client_id') clientId?: number) {
    // Obtener el idioma de la solicitud
    const locale = request.cookies?.locale || 'es'; // Asume que el idioma está en una cookie
    
    // Si se proporciona client_id, filtrar por ese cliente
    const clubs = clientId 
      ? await this.appService.findByClientId(clientId, locale)
      : await this.appService.findAll(locale);

    const groupedClubs = groupByFirstLetter(clubs); // Agrupar por primera letra
    
    return { 
      message: '¡Homologar notas!',
      title: 'Homologación Notas',
      pageCss: 'home',
      groupedClubs: groupedClubs // Pasar los datos a la vista
    };
  }

  @Get('/upload-second')
  @Render('main/upload-file-users-note')
  async rootSecond(@Req() request: Request, @Query('client_id') clientId?: number) {
    // Obtener el idioma de la solicitud
    const locale = request.cookies?.locale || 'es'; // Asume que el idioma está en una cookie
    
    // Si se proporciona client_id, filtrar por ese cliente
    const clubs = clientId 
      ? await this.appService.findByClientId(clientId, locale)
      : await this.appService.findAll(locale);
    
    return { 
      message: '¡Homologar notas second!',
      title: 'Homologación Notas second',
      pageCss: 'home',
      clubs: clubs // Pasar los datos a la vista
    };
  }

  // se agrega un endpoint específico para filtrar por client_id
  @Get('by-client/:clientId')
  @Render('main/index')
  async byClient(@Param('clientId') clientId: number, @Req() request: Request) {
    const locale = request.cookies?.locale || 'es';
    const clubs = await this.appService.findByClientId(clientId, locale);
    
    return { 
      message: '¡Homologar notas!',
      title: 'Homologación Notas',
      pageCss: 'home',
      clubs: clubs,
      clientId: clientId
    };
  }
  
  @Get('about')
  @Render('main/about')
  about() {
    return { 
      title: 'Acerca de Nosotros',
      content: 'Esta es la página de información sobre nuestra aplicación.',
    };
  }
  
  @Get('contact')
  @Render('main/contact')
  contact() {
    return { 
      title: 'Contacto',
      content: 'Aquí puedes encontrar información de contacto.'
    };
  }
}


function groupByFirstLetter(clubs: any[]) {
  const grouped = {};

  clubs.forEach(club => {
    const firstLetter = club.title.charAt(0).toUpperCase();
    if (!grouped[firstLetter]) {
      grouped[firstLetter] = [];
    }
    grouped[firstLetter].push(club);
  });

  // Opcional: ordenar las letras
  const sortedGroups = Object.keys(grouped)
    .sort()
    .reduce((obj, key) => {
      obj[key] = grouped[key].sort((a, b) => a.title.localeCompare(b.title));
      return obj;
    }, {});

  return sortedGroups;
}
