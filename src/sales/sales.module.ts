import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { CommissionsModule } from '../commissions/commissions.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [CommissionsModule, StockModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
