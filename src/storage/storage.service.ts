import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

/** Arquivo recebido do multer (evita depender de @types/multer). */
export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Storage de mídia por tenant. Provider `local` (disco) atrás de metadados em
 * `stored_files` (RLS). O isolamento entre barbearias é garantido pela RLS:
 * `getMeta`/`read` rodam em `withTenant`, então um tenant nunca lê o arquivo de
 * outro (retorna null -> 404 no controller).
 */
@Injectable()
export class StorageService {
  private readonly dir = process.env.STORAGE_DIR || 'storage';

  constructor(private readonly prisma: PrismaService) {}

  async save(tenantId: string, file: UploadedFileLike) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.storedFile.create({
        data: {
          tenantId,
          key: '',
          filename: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          provider: 'local',
        },
        select: { id: true },
      });
      const key = `${tenantId}/${row.id}`;
      const path = join(this.dir, key);
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, file.buffer);
      await tx.storedFile.update({ where: { id: row.id }, data: { key } });
      return {
        id: row.id,
        url: `/api/storage/${row.id}`,
        contentType: file.mimetype,
        filename: file.originalname,
      };
    });
  }

  /** Metadados do arquivo (tenant-scoped). Null se não existir/for de outro tenant. */
  getMeta(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.storedFile.findFirst({
        where: { id },
        select: {
          id: true,
          key: true,
          filename: true,
          contentType: true,
          size: true,
        },
      }),
    );
  }

  /** Lê o arquivo (metadados + bytes do disco). Null se ausente. */
  async read(tenantId: string, id: string) {
    const meta = await this.getMeta(tenantId, id);
    if (!meta) return null;
    try {
      const buffer = await fs.readFile(join(this.dir, meta.key));
      return { buffer, contentType: meta.contentType, filename: meta.filename };
    } catch {
      return null;
    }
  }
}
