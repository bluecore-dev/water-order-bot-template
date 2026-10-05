import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Module({
  imports: [],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
