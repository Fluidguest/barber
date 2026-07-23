import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService], // futura integração com o PDV (baixa por venda)
})
export class StockModule {}
