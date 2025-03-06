import { Controller, Get, Render } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('ve')
export class AppController {
  // constructor(private readonly appService: AppService) {}

  @Get()
  @Render('main/index')
  root() {
    return { 
      message: '¡Hola mundo!',
      title: 'Página Principal',
      pageCss: 'home'
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