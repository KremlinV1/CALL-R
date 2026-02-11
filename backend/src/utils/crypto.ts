import crypto from 'crypto';

// Single shared encryption key — loaded once, reused everywhere
// In production, this MUST be set; in dev, fall back to a stable default so restarts don't break encrypted data
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('ENCRYPTION_KEY is required in production'); })()
    : 'dev_only_encryption_key_32chars!'
) as string;
const IV_LENGTH = 16;

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(apiKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptApiKey(encryptedKey: string): string {
  const textParts = encryptedKey.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
