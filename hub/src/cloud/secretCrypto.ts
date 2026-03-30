import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    timingSafeEqual
} from 'node:crypto'
import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { configuration } from '../configuration'

type StoredCloudSecretCiphertext = {
    iv: string
    tag: string
    ciphertext: string
}

const SECRET_KEY_FILE = 'cloud-secret-key.bin'
const KEY_LENGTH = 32

let cachedSecretKey: Buffer | null = null

function getOrCreateSecretKey(): Buffer {
    if (cachedSecretKey) {
        return cachedSecretKey
    }

    const keyPath = join(configuration.dataDir, SECRET_KEY_FILE)
    if (existsSync(keyPath)) {
        const file = readFileSync(keyPath)
        if (file.length !== KEY_LENGTH) {
            throw new Error(`Invalid cloud secret key length at ${keyPath}`)
        }
        cachedSecretKey = Buffer.from(file)
        return cachedSecretKey
    }

    mkdirSync(configuration.dataDir, { recursive: true, mode: 0o700 })
    const nextKey = randomBytes(KEY_LENGTH)
    writeFileSync(keyPath, nextKey, { mode: 0o600 })
    cachedSecretKey = nextKey
    return cachedSecretKey
}

export function encryptCloudSecretValue(value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', getOrCreateSecretKey(), iv)
    const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final()
    ])
    const payload: StoredCloudSecretCiphertext = {
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64')
    }
    return JSON.stringify(payload)
}

export function decryptCloudSecretValue(encoded: string): string {
    const parsed = JSON.parse(encoded) as StoredCloudSecretCiphertext
    if (!parsed?.iv || !parsed?.tag || !parsed?.ciphertext) {
        throw new Error('Invalid cloud secret payload')
    }
    const decipher = createDecipheriv(
        'aes-256-gcm',
        getOrCreateSecretKey(),
        Buffer.from(parsed.iv, 'base64')
    )
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))
    const cleartext = Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
        decipher.final()
    ])
    return cleartext.toString('utf8')
}

export function hashEnrollmentToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

export function previewEnrollmentToken(token: string): string {
    const trimmed = token.trim()
    if (trimmed.length <= 10) {
        return trimmed
    }
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

export function secureCompareTokenHash(token: string, expectedHash: string): boolean {
    const tokenHash = Buffer.from(hashEnrollmentToken(token), 'hex')
    const expected = Buffer.from(expectedHash, 'hex')
    if (tokenHash.length !== expected.length) {
        return false
    }
    return timingSafeEqual(tokenHash, expected)
}
