import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

/**
 * Storage de mídia (upload/download por tenant). JwtService e PrismaService são
 * globais (ver auth/prisma modules), então não há imports aqui — igual aos
 * demais módulos de domínio. Exporta o service para o whatsapp reutilizar.
 */
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
