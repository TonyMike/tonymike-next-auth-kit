/**
 * Lightweight symmetric encryption using AES-GCM via the Web Crypto API.
 * Works in both browser and Node.js (>=18) / Edge runtimes.
 */

const ALGO = "AES-GCM";
const IV_LENGTH = 12; // bytes

function getTextEncoder() {
  return new TextEncoder();
}

function getTextDecoder() {
  return new TextDecoder();
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = getTextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, { name: ALGO }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypts a plaintext string using AES-GCM.
 * Returns a base64url-encoded string: `<iv>.<ciphertext>`
 */
export async function encrypt(data: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const ivArray = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  // Ensure we have a plain ArrayBuffer for SubtleCrypto
  const iv = ivArray.buffer.slice(0, IV_LENGTH) as ArrayBuffer;
  const encoded = getTextEncoder().encode(data);

  const cipherBuffer = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);

  const ivB64 = bufferToBase64(new Uint8Array(iv));
  const cipherB64 = bufferToBase64(new Uint8Array(cipherBuffer));
  return `${ivB64}.${cipherB64}`;
}

/**
 * Decrypts a string produced by `encrypt`.
 */
export async function decrypt(data: string, secret: string): Promise<string> {
  const [ivB64, cipherB64] = data.split(".");
  if (!ivB64 || !cipherB64) {
    throw new Error("decrypt: invalid ciphertext format");
  }

  const key = await deriveKey(secret);
  const ivBytes = base64ToBuffer(ivB64);
  const iv = ivBytes.buffer.slice(
    ivBytes.byteOffset,
    ivBytes.byteOffset + ivBytes.byteLength
  ) as ArrayBuffer;

  const cipherBytes = base64ToBuffer(cipherB64);
  const cipherBuffer = cipherBytes.buffer.slice(
    cipherBytes.byteOffset,
    cipherBytes.byteOffset + cipherBytes.byteLength
  ) as ArrayBuffer;

  const plainBuffer = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipherBuffer);

  return getTextDecoder().decode(plainBuffer);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bufferToBase64(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64ToBuffer(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
