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
import { StockService } from './stock.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto, MoveStockDto } from './dto/move-stock.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateProductDto) {
    return this.stock.createProduct(u.tenantId, dto);
  }

  @Get()
  list(
    @CurrentUser() u: AuthUser,
    @Query('search') search?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.stock.listProducts(u.tenantId, search, lowStock === 'true');
  }

  @Get('alerts')
  alerts(@CurrentUser() u: AuthUser) {
    return this.stock.alerts(u.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.stock.getProduct(u.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.stock.updateProduct(u.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.stock.removeProduct(u.tenantId, id);
  }

  @Post(':id/movements')
  move(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: MoveStockDto,
  ) {
    return this.stock.move(u.tenantId, id, dto);
  }

  @Get(':id/movements')
  movements(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.stock.listMovements(u.tenantId, id);
  }

  @Post(':id/adjust')
  adjust(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.stock.adjust(u.tenantId, id, dto);
  }
}
