import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';

@Module({
  imports: [],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminsModule {}
