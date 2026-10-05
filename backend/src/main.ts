import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { redactSecrets } from './common/utils/redact';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(AppConfigService).values;
  configureApp(app, config);
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  logger.log({ msg: 'Application started', port: config.port, host: config.host, env: config.env });
}

bootstrap().catch((err: Error) => {
  // Config validation errors list variable names only, never values.
  console.error(`Fatal startup error: ${redactSecrets(err.message)}`);
  process.exit(1);
});
