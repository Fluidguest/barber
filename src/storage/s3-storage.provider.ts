import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { StorageProvider } from './storage-provider';

/**
 * Armazenamento em S3/R2/MinIO (qualquer serviço compatível com S3).
 *
 * Por que sem SDK: a AWS SDK v3 traz dezenas de pacotes. Como só precisamos de
 * PUT/GET/DELETE de objeto, assinamos as requisições com **SigV4** na mão
 * (algoritmo público) e usamos `fetch`. Zero dependência nova.
 *
 * Necessário quando a API roda em MAIS DE UMA instância: o disco local não é
 * compartilhado, então um upload feito na instância A não existe na B. Em
 * object storage, todas veem o mesmo arquivo.
 *
 * Env: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY,
 *      S3_FORCE_PATH_STYLE (true p/ R2/MinIO).
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger('S3Storage');
  private readonly region = process.env.S3_REGION || 'auto';
  private readonly bucket = process.env.S3_BUCKET || '';
  private readonly accessKey = process.env.S3_ACCESS_KEY || '';
  private readonly secretKey = process.env.S3_SECRET_KEY || '';
  private readonly endpoint = (process.env.S3_ENDPOINT || '').replace(/\/$/, '');
  // R2/MinIO usam path-style (host/bucket/key); a AWS usa virtual-host.
  private readonly pathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

  constructor() {
    if (!this.bucket || !this.accessKey || !this.secretKey || !this.endpoint) {
      // Falha explícita: melhor não subir do que aceitar upload e perder.
      throw new BadRequestException(
        'STORAGE_PROVIDER=s3 exige S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY e S3_SECRET_KEY',
      );
    }
  }

  /** Objeto é isolado por tenant no próprio caminho. */
  private objectKey(tenantId: string, key: string) {
    return `${tenantId}/${key}`;
  }

  private urlFor(objectKey: string): { url: string; host: string } {
    const { host } = new URL(this.endpoint);
    if (this.pathStyle) {
      return { url: `${this.endpoint}/${this.bucket}/${objectKey}`, host };
    }
    const vhost = `${this.bucket}.${host}`;
    return { url: `${this.endpoint.replace(host, vhost)}/${objectKey}`, host: vhost };
  }

  async put(tenantId: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    const res = await this.signedFetch('PUT', this.objectKey(tenantId, key), buffer, contentType);
    if (!res.ok) {
      this.logger.error(`PUT falhou (${res.status})`);
      throw new BadRequestException('Falha ao salvar o arquivo');
    }
  }

  async get(tenantId: string, key: string): Promise<Buffer> {
    const res = await this.signedFetch('GET', this.objectKey(tenantId, key));
    if (res.status === 404) throw new NotFoundException('Arquivo não encontrado');
    if (!res.ok) throw new BadRequestException('Falha ao ler o arquivo');
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(tenantId: string, key: string): Promise<void> {
    await this.signedFetch('DELETE', this.objectKey(tenantId, key));
  }

  // ---- Assinatura AWS Signature V4 ----------------------------------------

  private async signedFetch(
    method: string,
    objectKey: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const { url, host } = this.urlFor(objectKey);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256')
      .update(body ?? Buffer.alloc(0))
      .digest('hex');

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) headers['content-type'] = contentType;

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders =
      Object.keys(headers)
        .sort()
        .map((k) => `${k}:${headers[k]}`)
        .join('\n') + '\n';

    const canonicalUri =
      '/' +
      new URL(url).pathname
        .slice(1)
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');

    const canonicalRequest = [
      method,
      canonicalUri,
      '', // query string (não usamos)
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers['authorization'] =
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  }
}
