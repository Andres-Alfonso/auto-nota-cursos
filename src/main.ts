import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import * as hbs from 'hbs';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { registerHandlebarsHelpers } from './handlebars-helpers';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );
  // app.enableCors({
  //   origin: ['https://formacionvirtual.clinicaupb.org.co'], // o usa '*' si estás en desarrollo
  //   methods: 'GET,POST,PUT,DELETE,OPTIONS',
  //   allowedHeaders: 'Origin,Content-Type,Accept,Authorization,X-Requested-With',
  //   credentials: true,
  // });
  // app.enableShutdownHooks();

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
  hbs.registerPartials(join(__dirname, '..', 'views', 'components'));
  app.set('view options', { 
    layout: 'layouts/main'
  });
  registerHandlebarsHelpers();
  // Registrar helpers de Handlebars
  hbs.registerHelper('currentYear', () => new Date().getFullYear());
  hbs.registerHelper('eq', (a, b) => a === b);
  hbs.registerHelper('json', (context) => JSON.stringify(context));
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
