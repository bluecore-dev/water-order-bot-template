import { Module } from '@nestjs/common';
import { AmocrmModule } from '../integrations/amocrm/amocrm.module';
import { AddressesModule } from '../modules/addresses/addresses.module';
import { AdminsModule } from '../modules/admins/admins.module';
import { OrdersModule } from '../modules/orders/orders.module';
import { ProductsModule } from '../modules/products/products.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { StatsModule } from '../modules/stats/stats.module';
import { StorageModule } from '../modules/storage/storage.module';
import { UsersModule } from '../modules/users/users.module';
import { BotService } from './bot.service';
import { CatalogFlow } from './conversations/catalog.flow';
import { CheckoutFlow } from './conversations/checkout.flow';
import { AddressesHandler } from './handlers/addresses.handler';
import { AdminAdminsHandler } from './handlers/admin/admin-admins.handler';
import { AdminAmocrmHandler } from './handlers/admin/admin-amocrm.handler';
import { AdminOrdersHandler } from './handlers/admin/admin-orders.handler';
import { AdminProductsHandler } from './handlers/admin/admin-products.handler';
import { AdminSettingsHandler } from './handlers/admin/admin-settings.handler';
import { AdminHandler } from './handlers/admin/admin.handler';
import { FallbackHandler } from './handlers/fallback.handler';
import { HistoryHandler } from './handlers/history.handler';
import { OrderHandler } from './handlers/order.handler';
import { ProductHandler } from './handlers/product.handler';
import { ProfileHandler } from './handlers/profile.handler';
import { StartHandler } from './handlers/start.handler';
import { BotUi } from './services/bot-ui.service';
import { NotifierService } from './services/notifier.service';
import { ProductMediaService } from './services/product-media.service';
import { TelegramFilesService } from './services/telegram-files.service';
import { TelegramWebhookController } from './telegram-webhook.controller';

@Module({
  imports: [
    UsersModule,
    ProductsModule,
    OrdersModule,
    AddressesModule,
    SettingsModule,
    AdminsModule,
    StatsModule,
    StorageModule,
    AmocrmModule,
  ],
  controllers: [TelegramWebhookController],
  providers: [
    BotService,
    BotUi,
    ProductMediaService,
    TelegramFilesService,
    NotifierService,
    CatalogFlow,
    CheckoutFlow,
    StartHandler,
    AdminHandler,
    ProductHandler,
    OrderHandler,
    HistoryHandler,
    ProfileHandler,
    AddressesHandler,
    AdminProductsHandler,
    AdminOrdersHandler,
    AdminSettingsHandler,
    AdminAmocrmHandler,
    AdminAdminsHandler,
    FallbackHandler,
  ],
  exports: [BotService],
})
export class BotModule {}
