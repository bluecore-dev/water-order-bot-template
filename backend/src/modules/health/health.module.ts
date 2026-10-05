import { Module } from '@nestjs/common';
import { BotModule } from '../../bot/bot.module';
import { HealthController } from './health.controller';

@Module({
  imports: [BotModule],
  controllers: [HealthController],
})
export class HealthModule {}
