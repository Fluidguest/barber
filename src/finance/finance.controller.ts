import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CreateFinanceCategoryDto } from './dto/create-category.dto';
import { CreateFinanceEntryDto } from './dto/create-entry.dto';
import { UpdateFinanceEntryDto } from './dto/update-entry.dto';
import { PayEntryDto } from './dto/pay-entry.dto';
import { ListEntriesDto } from './dto/list-entries.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // Categorias
  @Post('categories')
  createCategory(@CurrentUser() u: AuthUser, @Body() dto: CreateFinanceCategoryDto) {
    return this.finance.createCategory(u.tenantId, dto);
  }

  @Get('categories')
  listCategories(@CurrentUser() u: AuthUser) {
    return this.finance.listCategories(u.tenantId);
  }

  // Fluxo de caixa
  @Get('cashflow')
  cashflow(
    @CurrentUser() u: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.cashflow(u.tenantId, from, to);
  }

  // Lançamentos
  @Post('entries')
  createEntry(@CurrentUser() u: AuthUser, @Body() dto: CreateFinanceEntryDto) {
    return this.finance.createEntry(u.tenantId, dto);
  }

  @Get('entries')
  listEntries(@CurrentUser() u: AuthUser, @Query() q: ListEntriesDto) {
    return this.finance.listEntries(u.tenantId, q);
  }

  @Get('entries/:id')
  getEntry(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.finance.getEntry(u.tenantId, id);
  }

  @Patch('entries/:id')
  updateEntry(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceEntryDto,
  ) {
    return this.finance.updateEntry(u.tenantId, id, dto);
  }

  @Post('entries/:id/pay')
  pay(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: PayEntryDto,
  ) {
    return this.finance.pay(u.tenantId, id, dto);
  }

  @Post('entries/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.finance.cancel(u.tenantId, id);
  }

  @Delete('entries/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.finance.remove(u.tenantId, id);
  }
}
