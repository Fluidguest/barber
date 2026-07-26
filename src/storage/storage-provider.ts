/**
 * Contrato de armazenamento de arquivos. Implementação padrão: local (disco).
 * S3/R2 (compatível) pluga atrás desta interface — ver docs/INTEGRATIONS.md.
 */
export interface StorageProvider {
  put(tenantId: string, key: string, buffer: Buffer, contentType: string): Promise<void>;
  get(tenantId: string, key: string): Promise<Buffer>;
  remove(tenantId: string, key: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
