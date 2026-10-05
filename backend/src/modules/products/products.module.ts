import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';

@Module({
  imports: [],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
