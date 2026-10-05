import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { buildLoggerConfig } from './common/logging/logger.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './database/prisma.module';
import { BotModule } from './bot/bot.module';
import { AmocrmModule } from './integrations/amocrm/amocrm.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Modular monolith: one process hosts the Telegram bot, the amoCRM sync worker and a small
 * HTTP surface (health, Telegram webhook, amoCRM OAuth callback, Swagger).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => buildLoggerConfig(config.values),
    }),
    PrismaModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    BotModule,
    AmocrmModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
