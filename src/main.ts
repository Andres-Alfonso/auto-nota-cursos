import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import * as hbs from 'hbs';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['/ve*path'], // Excluye las rutas que empiezan con '/ve'
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      // transformOptions: {
      //   enableImplicitConversion: true,
      // },
    })
  );
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/' // Esto hace que los archivos estáticos sean accesibles desde la raíz
  });
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  hbs.registerPartials(join(__dirname, '..', 'views/partials'));
  app.set('view options', { 
    layout: 'layouts/main'
  });
  // Registrar helpers de Handlebars
  hbs.registerHelper('currentYear', () => new Date().getFullYear());
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
