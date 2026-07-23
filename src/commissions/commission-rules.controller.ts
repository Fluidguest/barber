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
import { CommissionRulesService } from './commission-rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('commission-rules')
export class CommissionRulesController {
  constructor(private readonly rules: CommissionRulesService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateRuleDto) {
    return this.rules.create(u.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.rules.list(u.tenantId);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.rules.update(u.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.rules.remove(u.tenantId, id);
  }
}
