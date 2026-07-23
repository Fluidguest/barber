import { Module } from '@nestjs/common';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRulesService } from './commission-rules.service';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

@Module({
  controllers: [CommissionRulesController, CommissionsController],
  providers: [CommissionRulesService, CommissionsService],
  exports: [CommissionsService], // usado pelo SalesModule no fechamento da comanda
})
export class CommissionsModule {}
