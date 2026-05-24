import { describe, test, expect } from 'bun:test'
import { encrypt, decrypt, maskKey } from './crypto'

describe('encrypt / decrypt round-trip', () => {
  test('plaintext survives round-trip', async () => {
    const orig = 'sk-test-12345'
    const ct = await encrypt(orig)
    expect(ct).toContain(':')
    expect(ct).not.toContain(orig)
    expect(await decrypt(ct)).toBe(orig)
  })

  test('two encrypts of same value yield different ciphertexts (random IV)', async () => {
    const ct1 = await encrypt('secret')
    const ct2 = await encrypt('secret')
    expect(ct1).not.toBe(ct2)
    expect(await decrypt(ct1)).toBe('secret')
    expect(await decrypt(ct2)).toBe('secret')
  })

  test('unicode survives round-trip', async () => {
    const orig = 'héllo 🔐 wörld'
    expect(await decrypt(await encrypt(orig))).toBe(orig)
  })

  test('malformed ciphertext throws', async () => {
    await expect(decrypt('not-a-valid-ciphertext')).rejects.toThrow(/Invalid ciphertext format/)
  })
})

describe('maskKey', () => {
  test('short key fully masked', () => {
    expect(maskKey('abc')).toBe('••••••••')
    expect(maskKey('exactly8')).toBe('••••••••')
  })

  test('long key keeps first 4 and last 4', () => {
    const masked = maskKey('sk-abcdef0123456789')
    expect(masked.startsWith('sk-a')).toBe(true)
    expect(masked.endsWith('6789')).toBe(true)
    expect(masked).toContain('•')
  })

  test('cap on bullets count (max 12)', () => {
    const long = 'a'.repeat(100)
    const masked = maskKey(long)
    const bullets = (masked.match(/•/g) ?? []).length
    expect(bullets).toBeLessThanOrEqual(12)
  })
})
