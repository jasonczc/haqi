import { randomUUID } from 'node:crypto'
import type {
    CloudSecret,
    CloudSecretAdapter,
    CloudWorkerEnrollmentToken,
    ResolvedSecret
} from '@hapi/protocol/types'
import type {
    Store,
    StoredCloudSecret,
    StoredCloudWorkerEnrollmentToken,
    StoredCloudWorkerSessionToken
} from '../store'
import {
    decryptCloudSecretValue,
    encryptCloudSecretValue,
    hashEnrollmentToken,
    previewEnrollmentToken,
    secureCompareTokenHash
} from './secretCrypto'

function toCloudSecret(secret: StoredCloudSecret): CloudSecret {
    return {
        id: secret.id,
        namespace: secret.namespace,
        name: secret.name,
        description: secret.description ?? undefined,
        mountAs: secret.mountAs ?? undefined,
        envName: secret.envName ?? undefined,
        filePath: secret.filePath ?? undefined,
        adapter: (secret.adapter ?? undefined) as CloudSecretAdapter | undefined,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
        lastAccessedAt: secret.lastAccessedAt ?? undefined
    }
}

function toCloudWorkerEnrollmentToken(record: ReturnType<Store['cloud']['getEnrollmentToken']> extends infer T
    ? NonNullable<T>
    : never): CloudWorkerEnrollmentToken {
    return {
        id: record.id,
        namespace: record.namespace,
        label: record.label ?? undefined,
        machineId: record.machineId ?? undefined,
        tokenPreview: record.tokenPreview,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt ?? undefined,
        revokedAt: record.revokedAt ?? undefined
    }
}

function isRecordExpired(expiresAt: number | null | undefined): boolean {
    return typeof expiresAt === 'number' && expiresAt <= Date.now()
}

function isRecordRevoked(revokedAt: number | null | undefined): boolean {
    return typeof revokedAt === 'number' && revokedAt <= Date.now()
}

export class SecretBroker {
    constructor(private readonly store: Store) {
    }

    listSecrets(namespace: string): CloudSecret[] {
        return this.store.cloud.listSecretsByNamespace(namespace).map(toCloudSecret)
    }

    getSecret(namespace: string, id: string): CloudSecret | null {
        const secret = this.store.cloud.getSecretByNamespace(id, namespace)
        return secret ? toCloudSecret(secret) : null
    }

    createSecret(options: {
        namespace: string
        name: string
        value: string
        description?: string | null
        mountAs?: 'env' | 'file' | null
        envName?: string | null
        filePath?: string | null
        adapter?: CloudSecretAdapter | null
    }): CloudSecret {
        const secret = this.store.cloud.createSecret({
            namespace: options.namespace,
            name: options.name,
            encryptedValue: encryptCloudSecretValue(options.value),
            description: options.description,
            mountAs: options.mountAs ?? null,
            envName: options.envName,
            filePath: options.filePath,
            adapter: options.adapter ?? null
        })
        return toCloudSecret(secret)
    }

    updateSecret(options: {
        namespace: string
        id: string
        name?: string
        value?: string
        description?: string | null
        mountAs?: 'env' | 'file' | null
        envName?: string | null
        filePath?: string | null
        adapter?: CloudSecretAdapter | null
    }): CloudSecret | null {
        const updated = this.store.cloud.updateSecret({
            id: options.id,
            namespace: options.namespace,
            name: options.name,
            encryptedValue: options.value !== undefined
                ? encryptCloudSecretValue(options.value)
                : undefined,
            description: options.description,
            mountAs: options.mountAs,
            envName: options.envName,
            filePath: options.filePath,
            adapter: options.adapter ?? undefined
        })
        return updated ? toCloudSecret(updated) : null
    }

    deleteSecret(namespace: string, id: string): boolean {
        return this.store.cloud.deleteSecret(id, namespace)
    }

    resolveSecrets(options: {
        namespace: string
        secretNames: string[]
        requestId?: string
        machineId?: string
        sessionId?: string
    }): ResolvedSecret[] {
        const resolved: ResolvedSecret[] = []
        const seen = new Set<string>()
        for (const name of options.secretNames) {
            const normalized = name.trim()
            if (!normalized || seen.has(normalized)) {
                continue
            }
            seen.add(normalized)
            const secret = this.store.cloud.getSecretByName(options.namespace, normalized)
            if (!secret) {
                throw new Error(`secret_not_found:${normalized}`)
            }
            const value = decryptCloudSecretValue(secret.encryptedValue)
            this.store.cloud.createSecretAccessEvent({
                namespace: options.namespace,
                secretId: secret.id,
                secretName: secret.name,
                requestId: options.requestId,
                machineId: options.machineId,
                sessionId: options.sessionId
            })
            resolved.push({
                secretId: secret.id,
                secretName: secret.name,
                mountAs: secret.mountAs ?? 'env',
                envName: secret.envName ?? undefined,
                filePath: secret.filePath ?? undefined,
                value,
                adapter: (secret.adapter ?? undefined) as CloudSecretAdapter | undefined
            })
        }
        return resolved
    }

    createEnrollmentToken(options: {
        namespace: string
        label?: string | null
        machineId?: string | null
        ttlMinutes?: number | null
    }): { token: string; record: CloudWorkerEnrollmentToken } {
        const token = `hqe_${randomUUID().replaceAll('-', '')}`
        const record = this.store.cloud.createEnrollmentToken({
            namespace: options.namespace,
            label: options.label,
            machineId: options.machineId,
            tokenHash: hashEnrollmentToken(token),
            tokenPreview: previewEnrollmentToken(token),
            expiresAt: options.ttlMinutes && options.ttlMinutes > 0
                ? Date.now() + options.ttlMinutes * 60_000
                : null
        })
        return {
            token,
            record: toCloudWorkerEnrollmentToken(record)
        }
    }

    listEnrollmentTokens(namespace: string): CloudWorkerEnrollmentToken[] {
        return this.store.cloud.listEnrollmentTokensByNamespace(namespace).map(toCloudWorkerEnrollmentToken)
    }

    revokeEnrollmentToken(namespace: string, id: string): CloudWorkerEnrollmentToken | null {
        const record = this.store.cloud.revokeEnrollmentToken(id, namespace)
        return record ? toCloudWorkerEnrollmentToken(record) : null
    }

    updateEnrollmentToken(namespace: string, id: string, updates: {
        label?: string | null
        expiresAt?: number | null
    }): CloudWorkerEnrollmentToken | null {
        const record = this.store.cloud.updateEnrollmentToken(id, namespace, updates)
        return record ? toCloudWorkerEnrollmentToken(record) : null
    }

    resolveEnrollmentToken(token: string): CloudWorkerEnrollmentToken | null {
        const record = this.resolveEnrollmentTokenRecord(token)
        return record ? toCloudWorkerEnrollmentToken(record) : null
    }

    resolveEnrollmentTokenRecord(token: string): StoredCloudWorkerEnrollmentToken | null {
        const hash = hashEnrollmentToken(token)
        const record = this.store.cloud.getEnrollmentTokenByHash(hash)
        if (!record) {
            return null
        }
        if (isRecordRevoked(record.revokedAt)) {
            return null
        }
        if (isRecordExpired(record.expiresAt)) {
            return null
        }
        if (!secureCompareTokenHash(token, record.tokenHash)) {
            return null
        }
        return record
    }

    createWorkerSessionToken(options: {
        namespace: string
        machineId?: string | null
        enrollmentTokenId?: string | null
        expiresAt?: number | null
    }): { token: string; record: StoredCloudWorkerSessionToken } {
        const token = `hqs_${randomUUID().replaceAll('-', '')}`
        const record = this.store.cloud.createWorkerSession({
            namespace: options.namespace,
            machineId: options.machineId,
            enrollmentTokenId: options.enrollmentTokenId,
            tokenHash: hashEnrollmentToken(token),
            tokenPreview: previewEnrollmentToken(token),
            expiresAt: options.expiresAt ?? null
        })
        return { token, record }
    }

    resolveWorkerSessionToken(token: string): StoredCloudWorkerSessionToken | null {
        const hash = hashEnrollmentToken(token)
        const record = this.store.cloud.getWorkerSessionByHash(hash)
        if (!record) {
            return null
        }
        if (isRecordRevoked(record.revokedAt) || isRecordExpired(record.expiresAt)) {
            return null
        }
        if (!secureCompareTokenHash(token, record.tokenHash)) {
            return null
        }
        // Sliding renewal: every successful resolve extends the worker session
        // so a worker that keeps heartbeating effectively never expires.
        // Without this, the session token inherits the enrollment token's
        // short TTL (~10 min) and the worker can't reconnect after any hub
        // restart that outlasts the window.
        const extendedTo = Date.now() + WORKER_SESSION_RENEW_MS
        this.store.cloud.touchWorkerSession(record.id, Date.now(), extendedTo)
        return this.store.cloud.getWorkerSession(record.id) ?? record
    }

    exchangeEnrollmentToken(token: string): {
        namespace: string
        machineId?: string | null
        workerSessionToken: string
        enrollmentTokenId: string
    } | null {
        const record = this.resolveEnrollmentTokenRecord(token)
        if (!record) {
            return null
        }

        // CAS-style revoke: atomically mark the token as used.
        // If another concurrent request already revoked it, this returns false.
        const revoked = this.store.cloud.revokeEnrollmentTokenIfActive(record.id, record.namespace)
        if (!revoked) {
            return null // Already revoked by concurrent request
        }

        // Worker session lives on its own long TTL, independent of the
        // enrollment token's short bootstrap window. Every heartbeat bumps
        // the window forward via resolveWorkerSessionToken.
        const workerSession = this.createWorkerSessionToken({
            namespace: record.namespace,
            machineId: record.machineId,
            enrollmentTokenId: record.id,
            expiresAt: Date.now() + WORKER_SESSION_RENEW_MS
        })
        return {
            namespace: record.namespace,
            machineId: record.machineId,
            workerSessionToken: workerSession.token,
            enrollmentTokenId: record.id
        }
    }
}

// 30 days: a worker that heartbeats weekly stays authenticated forever;
// a worker that disappears for a month is treated as gone and must re-enroll.
const WORKER_SESSION_RENEW_MS = 30 * 24 * 60 * 60 * 1000
