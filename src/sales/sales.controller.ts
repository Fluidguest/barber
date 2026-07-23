import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { AddItemDto } from './dto/add-item.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { SetAdjustmentDto } from './dto/set-adjustment.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(u.tenantId, dto);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.sales.get(u.tenantId, id);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddItemDto,
  ) {
    return this.sales.addItem(u.tenantId, id, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.sales.removeItem(u.tenantId, id, itemId);
  }

  @Post(':id/payments')
  addPayment(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.sales.addPayment(u.tenantId, id, dto);
  }

  /** Define/remove acréscimo ou desconto (percentual ou fixo). */
  @Post(':id/adjustment')
  setAdjustment(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetAdjustmentDto,
  ) {
    return this.sales.setAdjustment(u.tenantId, id, dto);
  }

  @Post(':id/close')
  close(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.sales.close(u.tenantId, id);
  }
}
