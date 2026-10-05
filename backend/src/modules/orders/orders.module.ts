import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { SettingsModule } from '../settings/settings.module';
import { OrdersService } from './orders.service';

@Module({
  imports: [AddressesModule, SettingsModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
