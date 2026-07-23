import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Criptografia de campo (AES-256-GCM) para dados sensíveis em repouso (LGPD).
 * Formato armazenado: "enc:v1:" + base64(iv[12] | authTag[16] | ciphertext).
 *
 * A chave vem de ENCRYPTION_KEY (qualquer string forte) — derivada para 32 bytes
 * via SHA-256. Em produção, use um segredo aleatório longo vindo de um cofre.
 *
 * Observação: por ser criptografia aleatória (IV único), NÃO permite busca por
 * igualdade no banco. Se um dia for preciso buscar por CPF, adiciona-se um
 * "blind index" (HMAC determinístico) numa coluna separada.
 */
const PREFIX = 'enc:v1:';

function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? 'dev-insecure-key-change-me';
  return createHash('sha256').update(secret).digest();
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Decifra; se o valor não estiver no formato cifrado, devolve como está (legado). */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
