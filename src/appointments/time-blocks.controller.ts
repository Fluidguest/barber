import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TimeBlocksService } from './time-blocks.service';
import { CreateTimeBlockDto } from './dto/create-time-block.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('time-blocks')
export class TimeBlocksController {
  constructor(private readonly blocks: TimeBlocksService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateTimeBlockDto) {
    return this.blocks.create(u.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.blocks.list(u.tenantId);
  }
}
