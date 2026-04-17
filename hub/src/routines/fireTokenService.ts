/**
 * Fire token issuance + verification.
 *
 * Mirrors hub/src/cloud/secretBroker.ts for enrollment tokens: we store
 * only the sha256 hash + a short preview, never the raw secret. A fire
 * token is scoped to one routine and grants the bearer permission to
 * POST /api/routines/:id/fire.
 *
 * Token shape: `hrf_<32-char-uuid-without-dashes>`. The prefix lets
 * operators / logs identify the token type without decoding it.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import type { Store } from '../store'
import type { RoutineFireToken } from '@hapi/protocol/schemas'

const TOKEN_PREFIX = 'hrf_'

function generateRawToken(): string {
    // 24 random bytes → 32 base64url chars. Matches the enrollment token
    // entropy budget.
    return TOKEN_PREFIX + randomBytes(24).toString('base64url')
}

export function hashFireToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

export function previewFireToken(token: string): string {
    const trimmed = token.trim()
    if (trimmed.length <= 10) return trimmed
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

export function secureCompareTokenHashes(raw: string, expectedHash: string): boolean {
    const actual = Buffer.from(hashFireToken(raw), 'hex')
    const expected = Buffer.from(expectedHash, 'hex')
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
}

export type IssuedFireToken = {
    record: RoutineFireToken
    /** Only exposed on creation; never persisted in plaintext. */
    secret: string
}

export function issueFireToken(
    store: Store,
    params: {
        id: string
        namespace: string
        routineId: string
        name?: string
        createdBy?: string
        /** Epoch ms; omit for no expiry. */
        expiresAt?: number
    }
): IssuedFireToken {
    const secret = generateRawToken()
    const record = store.routines.createFireToken({
        id: params.id,
        namespace: params.namespace,
        routineId: params.routineId,
        name: params.name,
        tokenHash: hashFireToken(secret),
        tokenPreview: previewFireToken(secret),
        createdBy: params.createdBy,
        expiresAt: params.expiresAt
    })
    return { record, secret }
}

export type TokenVerificationResult =
    | { ok: true; token: RoutineFireToken }
    // snake_case reasons so callers can concatenate them into snake_case
    // error codes (e.g. `token_wrong_routine`) without mixing separators.
    | { ok: false; reason: 'not_found' | 'revoked' | 'expired' | 'wrong_routine' }

/**
 * Verify a presented bearer token matches an active fire token for the
 * given routine. Touches `last_used_at` on success so operators can see
 * which tokens are live. Constant-time over token hash length.
 */
export function verifyFireToken(
    store: Store,
    params: {
        routineId: string
        presentedToken: string
    }
): TokenVerificationResult {
    const hash = hashFireToken(params.presentedToken)
    const token = store.routines.getFireTokenByHash(hash)
    if (!token) return { ok: false, reason: 'not_found' }
    if (token.routineId !== params.routineId) return { ok: false, reason: 'wrong_routine' }
    if (token.revokedAt) return { ok: false, reason: 'revoked' }
    if (token.expiresAt && token.expiresAt < Date.now()) return { ok: false, reason: 'expired' }
    store.routines.touchFireTokenLastUsed(token.id)
    return { ok: true, token }
}
