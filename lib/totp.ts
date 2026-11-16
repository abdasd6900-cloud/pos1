/**
 * Minimal TOTP (RFC 6238) generator — produces 6-digit codes compatible with
 * Google Authenticator / ente Auth. Runs entirely on-device, no network needed.
 *
 * Requires a base32-encoded secret (the same secret shown as a QR code when
 * setting up the authenticator entry).
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret: string): Uint8Array {
  const cleaned = secret.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (const char of cleaned) {
    const value = BASE32_CHARS.indexOf(char);
    if (value === -1) throw new Error(`Invalid base32 character: ${char}`);
    buffer = (buffer << 5) | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bytes.push((buffer >> (bitsLeft - 8)) & 0xff);
      bitsLeft -= 8;
    }
  }
  return new Uint8Array(bytes);
}

function intToBytes(num: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let value = num;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = value & 0xff;
    value = Math.floor(value / 0x100);
  }
  return bytes;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message as BufferSource);
  return new Uint8Array(signature);
}

/**
 * Generates a TOTP code for the current time.
 *
 * @param secret Base32-encoded secret key
 * @param period Time step in seconds (default 30)
 * @param digits Number of digits in the code (default 6)
 * @returns The TOTP code as a string
 */
export async function generateTOTP(
  secret: string,
  period: number = 30,
  digits: number = 6
): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / period);
  const message = intToBytes(counter);
  const hash = await hmacSha1(key, message);

  const offset = hash[hash.length - 1] & 0x0f;
  const truncated =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const code = truncated % Math.pow(10, digits);
  return code.toString().padStart(digits, '0');
}

/**
 * Returns the remaining seconds in the current TOTP period.
 * Useful for showing a countdown in the UI.
 */
export function totpSecondsRemaining(period: number = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period);
}

/**
 * Parses an otpauth:// URI (the kind encoded in authenticator QR codes)
 * and extracts the secret and label.
 */
export function parseOtpAuthUri(uri: string): { secret: string; label: string; issuer: string } | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'otpauth:') return null;
    const secret = url.searchParams.get('secret');
    if (!secret) return null;
    const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const issuer = url.searchParams.get('issuer') || '';
    return { secret, label, issuer };
  } catch {
    return null;
  }
}
