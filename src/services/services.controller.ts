import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CategoriesService } from './categories.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly categories: CategoriesService,
  ) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateServiceDto) {
    return this.services.create(u.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.services.list(u.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.services.get(u.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(u.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.services.remove(u.tenantId, id);
  }

  // Categorias (sub-recurso de serviços)
  @Post('categories/new')
  createCategory(@CurrentUser() u: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(u.tenantId, dto);
  }

  @Get('categories/all')
  listCategories(@CurrentUser() u: AuthUser) {
    return this.categories.list(u.tenantId);
  }
}
