import { configuration } from '../configuration'
import type { Store } from '../store'
import { constantTimeEquals } from '../utils/crypto'
import { parseAccessToken } from '../utils/accessToken'
import { SecretBroker } from './secretBroker'

export type ResolvedCliAuthToken =
    | {
        kind: 'legacy'
        namespace: string
        machineId?: string
    }
    | {
        kind: 'worker-session'
        namespace: string
        machineId?: string
    }
    | {
        kind: 'enrollment'
        namespace: string
        machineId?: string
        workerSessionToken: string
    }

export function resolveCliAuthToken(
    store: Store,
    token: string,
    options?: { allowEnrollment?: boolean }
): ResolvedCliAuthToken | null {
    const parsedToken = parseAccessToken(token)
    if (parsedToken && constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
        return {
            kind: 'legacy',
            namespace: parsedToken.namespace
        }
    }

    const secretBroker = new SecretBroker(store)
    const workerSession = secretBroker.resolveWorkerSessionToken(token)
    if (workerSession) {
        return {
            kind: 'worker-session',
            namespace: workerSession.namespace,
            machineId: workerSession.machineId ?? undefined
        }
    }

    // Only attempt enrollment token exchange when explicitly allowed.
    // HTTP API routes should NOT trigger enrollment exchange (SEC-6).
    // Only the Socket.IO auth middleware passes allowEnrollment: true.
    if (!options?.allowEnrollment) {
        return null
    }

    const enrollment = secretBroker.exchangeEnrollmentToken(token)
    if (!enrollment) {
        return null
    }

    return {
        kind: 'enrollment',
        namespace: enrollment.namespace,
        machineId: enrollment.machineId ?? undefined,
        workerSessionToken: enrollment.workerSessionToken
    }
}
