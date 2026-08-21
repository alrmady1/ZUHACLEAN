// Minimal password hashing using Node's built-in crypto (scrypt) — no extra
// dependency needed. Good enough for this MVP's local JSON store; swap for
// your database's own auth (or a proper auth provider) when this store is
// replaced with a real database, per README.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const testBuffer = scryptSync(password, salt, 64);
  return hashBuffer.length === testBuffer.length && timingSafeEqual(hashBuffer, testBuffer);
}
