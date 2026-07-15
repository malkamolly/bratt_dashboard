// ============================================================================
// Small symmetric-encryption helper — SERVER ONLY.
// ============================================================================
// We store each user's Slack OAuth token in the database. A stored access
// token is a live credential (it can read that person's Slack), so we encrypt
// it at rest instead of parking the raw token in a column. Supabase already
// encrypts the disk and RLS gates the row, so this is defense-in-depth: even
// someone who gets a database dump can't use the tokens without the key, which
// lives only in the server's environment (never in the database, never in the
// browser).
//
// Algorithm: AES-256-GCM. GCM is "authenticated" encryption — decryption fails
// loudly if the ciphertext was tampered with, so we can trust what we read back.
//
// Key: a 32-byte key, base64-encoded, in the SLACK_TOKEN_ENC_KEY env var.
// Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// ============================================================================

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the standard size for GCM

function key(): Buffer {
  const raw = process.env.SLACK_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      'SLACK_TOKEN_ENC_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `SLACK_TOKEN_ENC_KEY must decode to exactly 32 bytes (got ${buf.length}). It should be a base64-encoded 32-byte key.`,
    );
  }
  return buf;
}

/**
 * Encrypts a string, returning a self-contained token of the form
 * `iv:authTag:ciphertext`, each part base64. Everything needed to decrypt
 * (except the secret key) is inside the string, so it's safe to store as-is.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Reverses {@link encrypt}. Throws if the key is wrong or the data was altered. */
export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted payload.');
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
