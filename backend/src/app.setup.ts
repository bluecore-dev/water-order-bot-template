import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppConfig } from './config/configuration';

/** HTTP pipeline shared by main.ts and the e2e tests, so tests exercise the real setup. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const express = app as NestExpressApplication;
  app.setGlobalPrefix('api');
  express.set('trust proxy', 1); // behind Nginx: real client IP for rate limiting
  app.use(helmet());
  // No browser client calls this API (the admin UI lives inside Telegram), so CORS stays off.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (config.swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle('Water Order System API')
      .setDescription('Telegram ordering bot backend: health, Telegram webhook and amoCRM OAuth callback.')
      .setVersion('1.0')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }
}
