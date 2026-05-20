// AES-256-GCM encrypt/decrypt pour les clés API stockées en DB

const ALGO = 'AES-GCM'
const KEY_LEN = 256

const _DEV_KEY = 'forge-default-dev-key-32chars!!'

// Fail-fast : refuse de démarrer en prod sans clé explicite
const _MASTER_KEY = (() => {
  const key = process.env.ENCRYPTION_KEY
  if (process.env.NODE_ENV === 'production' && (!key || key === _DEV_KEY)) {
    throw new Error(
      '[FATAL] ENCRYPTION_KEY doit être défini en production (jamais la clé dev par défaut). ' +
      'Génère-en une : openssl rand -base64 32'
    )
  }
  return key || _DEV_KEY
})()

function getMasterKey(): string {
  return _MASTER_KEY
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const raw = enc.encode(secret.padEnd(32, '!').slice(0, 32))
  return crypto.subtle.importKey('raw', raw, { name: ALGO, length: KEY_LEN }, false, ['encrypt', 'decrypt'])
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey(getMasterKey())
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const cipherBuf = await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(plaintext))
  // Format: base64(iv):base64(cipher)
  const toB64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBufferLike).toString('base64')
  return `${toB64(iv)}:${toB64(cipherBuf)}`
}

export async function decrypt(ciphertext: string): Promise<string> {
  const [ivB64, cipherB64] = ciphertext.split(':')
  if (!ivB64 || !cipherB64) throw new Error('Invalid ciphertext format')
  const key = await deriveKey(getMasterKey())
  const iv = Buffer.from(ivB64, 'base64')
  const cipher = Buffer.from(cipherB64, 'base64')
  const plainBuf = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher)
  return new TextDecoder().decode(plainBuf)
}

// Masque une clé API pour l'affichage : sk-abc...xyz → sk-a••••xyz
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 12))}${key.slice(-4)}`
}
