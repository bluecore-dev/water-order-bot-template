import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './configuration';

/** Typed accessor so the rest of the code never reads process.env directly. */
@Injectable()
export class AppConfigService {
  readonly values: AppConfig;

  constructor(config: ConfigService) {
    this.values = config.getOrThrow<AppConfig>('app');
  }

  get bot() {
    return this.values.bot;
  }

  get amocrm() {
    return this.values.amocrm;
  }

  get timezone() {
    return this.values.timezone;
  }
}
