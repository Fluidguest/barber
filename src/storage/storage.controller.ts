import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StorageService, UploadedFileLike } from './storage.service';
import { verifySignedUrl } from './signed-url';

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
  ) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike,
  ) {
    if (!file) throw new BadRequestException('Arquivo ausente');
    return this.storage.save(user.tenantId, file);
  }

  /**
   * Download autorizado por (a) URL assinada (?t&exp&sig) — para <img>/<audio> —
   * OU (b) header Authorization Bearer. O antigo `?token=` NÃO autoriza
   * (vazava em log/Referer). Cross-tenant devolve 404 (RLS).
   */
  @Get(':id')
  async download(
    @Param('id') id: string,
    @Query('t') t: string | undefined,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let tenantId = verifySignedUrl(id, t, exp, sig);

    if (!tenantId) {
      const header = req.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        try {
          const payload = await this.jwt.verifyAsync(header.slice('Bearer '.length));
          if (payload?.tenantId) tenantId = payload.tenantId as string;
        } catch {
          // token inválido -> segue sem tenant -> 401 abaixo
        }
      }
    }

    if (!tenantId) throw new UnauthorizedException('Não autorizado');

    const f = await this.storage.read(tenantId, id);
    if (!f) throw new NotFoundException('Arquivo não encontrado');

    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${f.filename}"`);
    res.send(f.buffer);
  }
}
