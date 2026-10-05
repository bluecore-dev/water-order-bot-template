import { Module } from '@nestjs/common';
import { AmocrmApiClient } from './amocrm-api.client';
import { AmocrmAuthService } from './amocrm-auth.service';
import { AmocrmOauthController } from './amocrm-oauth.controller';
import { AmocrmSyncService } from './amocrm-sync.service';
import { AmocrmService } from './amocrm.service';

@Module({
  controllers: [AmocrmOauthController],
  providers: [AmocrmAuthService, AmocrmApiClient, AmocrmService, AmocrmSyncService],
  exports: [AmocrmAuthService, AmocrmService, AmocrmSyncService],
})
export class AmocrmModule {}
