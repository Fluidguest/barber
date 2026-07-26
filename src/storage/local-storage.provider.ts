import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { StorageProvider } from './storage-provider';

/**
 * Armazenamento local em disco (dev/self-hosted). Estrutura: <STORAGE_DIR>/<tenant>/<key>.
 * Para produção/escala, trocar por S3StorageProvider (S3/R2) via env STORAGE_PROVIDER.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir = resolve(process.env.STORAGE_DIR ?? 'storage');

  private path(tenantId: string, key: string) {
    // key nunca contém "..": é sempre um uuid+ext gerado internamente.
    return join(this.baseDir, tenantId, key);
  }

  async put(tenantId: string, key: string, buffer: Buffer): Promise<void> {
    const p = this.path(tenantId, key);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, buffer);
  }

  get(tenantId: string, key: string): Promise<Buffer> {
    return fs.readFile(this.path(tenantId, key));
  }

  async remove(tenantId: string, key: string): Promise<void> {
    await fs.rm(this.path(tenantId, key), { force: true });
  }
}
