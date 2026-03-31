/**
 * Comprehensive bug verification tests from 4 parallel review agents.
 * Each test proves a specific issue exists before it is fixed.
 *
 * Categories:
 * - SEC: Security review findings
 * - EDGE: RunnerLoop edge case findings
 * - SPAWN: Spawn coordinator path findings
 * - WEB: Web UI findings
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'

async function readSource(relativePath: string): Promise<string> {
    return fs.readFile(path.resolve(__dirname, '..', '..', '..', relativePath), 'utf-8')
}

// ============================================================
// SEC-1 (Critical): Enrollment token is never revoked after exchange
// ============================================================
describe('SEC-1: Enrollment token replay attack', () => {
    it('exchangeEnrollmentToken does not revoke the token after use', async () => {
        const source = await readSource('hub/src/cloud/secretBroker.ts')
        // Find the exchangeEnrollmentToken method
        const methodMatch = source.match(/exchangeEnrollmentToken[\s\S]*?(?=\n    \w|\n\})/m)
        expect(methodMatch).not.toBeNull()
        const method = methodMatch![0]

        // The bug: no revocation call after successful exchange
        expect(method).not.toContain('revokeEnrollmentToken')
        expect(method).not.toMatch(/revoked_at|revokedAt/)
        expect(method).not.toMatch(/UPDATE.*revoked/)
    })
})

// ============================================================
// SEC-2 (Critical): TOCTOU race in token exchange
// ============================================================
describe('SEC-2: Non-atomic enrollment token exchange', () => {
    it('resolveCliAuthToken calls exchangeEnrollmentToken on every auth attempt', async () => {
        const source = await readSource('hub/src/cloud/resolveCliAuthToken.ts')
        // The bug: exchange happens in the auth path, not behind a mutex or CAS
        expect(source).toContain('exchangeEnrollmentToken')
        // No locking or CAS mechanism
        expect(source).not.toContain('mutex')
        expect(source).not.toContain('compareAndSwap')
        expect(source).not.toMatch(/WHERE.*revoked_at\s*IS\s*NULL/)
    })
})

// ============================================================
// SEC-5 (Important): No machineId binding — client can claim any machineId
// ============================================================
describe('SEC-5: Unpinned enrollment allows machineId spoofing', () => {
    it('hub auth allows any machineId when enrollment token has none', async () => {
        const source = await readSource('hub/src/socket/server.ts')
        // The check only fires when BOTH resolved.machineId AND handshakeMachineId are truthy
        // If enrollment token has no machineId, the check is skipped entirely
        expect(source).toContain('resolved.machineId && handshakeMachineId && handshakeMachineId !== resolved.machineId')
        // No fallback validation for when resolved.machineId is absent
        expect(source).not.toMatch(/if\s*\(!resolved\.machineId\)/)
    })
})

// ============================================================
// SEC-6 (Important): Enrollment exchange as side-effect in HTTP auth
// ============================================================
describe('SEC-6: Enrollment token exchanged via HTTP API (not just socket)', () => {
    it('CLI HTTP routes use resolveCliAuthToken which triggers exchange', async () => {
        const cliRoute = await readSource('hub/src/web/routes/cli.ts')
        const resolver = await readSource('hub/src/cloud/resolveCliAuthToken.ts')
        // CLI HTTP routes call resolveCliAuthToken
        expect(cliRoute).toContain('resolveCliAuthToken')
        // resolveCliAuthToken unconditionally calls exchangeEnrollmentToken
        expect(resolver).toContain('exchangeEnrollmentToken')
        // No guard like "if (context === 'socket')" to prevent HTTP-triggered exchange
        expect(resolver).not.toMatch(/context|source|socket/)
    })
})

// ============================================================
// EDGE-1 (Medium): Token rotation overwrites local settings.json
// ============================================================
describe('EDGE-1: API client token rotation corrupts worker settings', () => {
    it('ApiClient.applyAuthUpgrade writes to local settings.json', async () => {
        const source = await readSource('cli/src/api/api.ts')
        // The bug: applyAuthUpgrade persists the rotated token to settings
        expect(source).toContain('applyAuthUpgrade')
        expect(source).toContain('updateSettings')
        // No check for whether we're in worker mode
        expect(source).not.toContain('executorType')
        expect(source).not.toContain('isWorker')
    })
})

// ============================================================
// EDGE-2 (High): ApiMachineClient also calls maybeAutoStartServer on disconnect
// ============================================================
describe('EDGE-2: ApiMachineClient tries to auto-start hub on disconnect', () => {
    it('apiMachine.ts calls maybeAutoStartServer on connection failure', async () => {
        const source = await readSource('cli/src/api/apiMachine.ts')
        expect(source).toContain('maybeAutoStartServer')
        // No mode check before calling it
        expect(source).not.toContain('isLocal')
        expect(source).not.toContain('isRemote')
        expect(source).not.toContain('executorType')
    })
})

// ============================================================
// EDGE-8 (Medium): Worker shutdown does not kill child sessions
// ============================================================
describe('EDGE-8: Shutdown handler does not terminate child sessions', () => {
    it('cleanupAndShutdown does not iterate pidToTrackedSession to kill children', async () => {
        const source = await readSource('cli/src/runner/runnerLoop.ts')
        // Find the cleanupAndShutdown function
        const cleanupMatch = source.match(/const cleanupAndShutdown[\s\S]*?(?=\n    \/\/ Wait for shutdown)/m)
        expect(cleanupMatch).not.toBeNull()
        const cleanup = cleanupMatch![0]

        // The bug: no child process termination in cleanup
        expect(cleanup).not.toContain('pidToTrackedSession')
        expect(cleanup).not.toContain('killProcess')
        expect(cleanup).not.toContain('killProcessByChildProcess')
    })
})

// ============================================================
// EDGE-9 (Medium): process.exit(0) in self-restart bypasses cleanup
// ============================================================
describe('EDGE-9: Self-restart process.exit bypasses cleanupAndShutdown', () => {
    it('heartbeat self-restart calls process.exit directly', async () => {
        const source = await readSource('cli/src/runner/runnerLoop.ts')
        // Find the version-check self-restart block
        const restartMatch = source.match(/installedCliMtimeMs !== startedWithCliMtimeMs[\s\S]*?process\.exit\(0\)/)
        expect(restartMatch).not.toBeNull()
        const restartBlock = restartMatch![0]

        // The bug: calls process.exit(0) without calling cleanupAndShutdown
        expect(restartBlock).toContain('process.exit(0)')
        expect(restartBlock).not.toContain('cleanupAndShutdown')
        expect(restartBlock).not.toContain('requestShutdown')
    })
})

// ============================================================
// SPAWN-1 (Critical): 'accepted' response treated as error
// ============================================================
describe('SPAWN-1: SpawnCoordinator treats accepted response as error', () => {
    it('handleSpawnResponse maps accepted to unexpected_async_response error', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // The bug: 'accepted' case falls through to an error
        expect(source).toContain('unexpected_async_response')
        // Check if it's in a failure branch
        const acceptedMatch = source.match(/['"]accepted['"][\s\S]*?unexpected_async_response/)
        expect(acceptedMatch).not.toBeNull()
    })
})

// ============================================================
// SPAWN-2 (High): Worker executorType may not be set in machineCache
// ============================================================
describe('SPAWN-2: Worker executorType not automatically set after enrollment', () => {
    it('socket server does not call getOrCreateMachine on enrollment', async () => {
        const source = await readSource('hub/src/socket/server.ts')
        // After worker-enrolled emit, there is no machine creation
        const enrollBlock = source.match(/worker-enrolled[\s\S]*?registerCliHandlers/)
        expect(enrollBlock).not.toBeNull()
        expect(enrollBlock![0]).not.toContain('getOrCreateMachine')
        expect(enrollBlock![0]).not.toContain('machineCache')
    })

    it('selectMachine filters by executorType — unset workers are excluded', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // selectMachine checks executorType
        expect(source).toMatch(/executorType.*cloud-self-hosted|cloud.*self.*hosted.*filter/)
    })
})

// ============================================================
// SPAWN-3 (Medium): Explicit machineId bypasses executorType check
// ============================================================
describe('SPAWN-3: Explicit machineId bypasses cloud worker filter', () => {
    it('selectMachine explicit path does not check executorType', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // Find the explicit machine selection path
        const selectMatch = source.match(/requestedMachineId[\s\S]*?getMachineByNamespace[\s\S]*?return/)
        expect(selectMatch).not.toBeNull()
        const selectBlock = selectMatch![0]
        // The bug: no executorType check on the explicit path
        expect(selectBlock).not.toContain('executorType')
        expect(selectBlock).not.toContain('cloud-self-hosted')
    })
})

// ============================================================
// SPAWN-6 (Low): null runnerState treated as selectable
// ============================================================
describe('SPAWN-6: null runnerState makes worker immediately selectable', () => {
    it('isRunnerStateSelectable returns true for null', async () => {
        const source = await readSource('hub/src/cloud/workerState.ts')
        // Find isRunnerStateSelectable
        const fnMatch = source.match(/export function isRunnerStateSelectable[\s\S]*?\n\}/)
        expect(fnMatch).not.toBeNull()
        const fn = fnMatch![0]
        // The bug: null/falsy check returns true (param is named runnerState)
        expect(fn).toMatch(/if\s*\(!runnerState\)\s*\{\s*\n\s*return\s*true/)
    })
})

// ============================================================
// WEB-1 (Critical): No SSE event for worker status changes
// ============================================================
describe('WEB-1: No SSE event invalidates cloudWorkers query', () => {
    it('useSSE.ts does not handle cloud-worker-updated events', async () => {
        const source = await readSource('web/src/hooks/useSSE.ts')
        expect(source).not.toContain('cloud-worker-updated')
        expect(source).not.toContain('cloudWorkers')
    })

    it('SyncEvent schema has no cloud-worker event type', async () => {
        const source = await readSource('shared/src/schemas.ts')
        expect(source).not.toContain('cloud-worker-updated')
    })
})

// ============================================================
// WEB-2 (Important): Workers page has no error state
// ============================================================
describe('WEB-2: Workers page shows empty state instead of error', () => {
    it('workers.tsx does not check isError', async () => {
        const source = await readSource('web/src/routes/cloud/workers.tsx')
        expect(source).toContain('isLoading')
        expect(source).not.toContain('isError')
        expect(source).not.toContain('workersQuery.error')
    })
})

// ============================================================
// WEB-4 (Important): selectable field check uses !== false on optional field
// ============================================================
describe('WEB-4: hasSelectableWorkers check is always true', () => {
    it('NewSession index.tsx checks selectable !== false which is always true for undefined', async () => {
        const source = await readSource('web/src/components/NewSession/index.tsx')
        // The bug: w.selectable is optional, undefined !== false is true
        expect(source).toContain('selectable !== false')
    })

    it('CloudWorkerSummary has selectable as optional', async () => {
        const source = await readSource('web/src/types/api.ts')
        const typeMatch = source.match(/CloudWorkerSummary[\s\S]*?\}/)
        expect(typeMatch).not.toBeNull()
        expect(typeMatch![0]).toMatch(/selectable\?/)
    })
})

// ============================================================
// WEB-5 (Important): /cloud/workers not reachable from navigation
// ============================================================
describe('WEB-5: Workers page has no navigation entry', () => {
    it('no sidebar or nav component links to /cloud/workers', async () => {
        // Check common navigation files
        const router = await readSource('web/src/router.tsx')
        // The route exists but is not referenced in any nav section
        expect(router).toContain("path: '/cloud/workers'")

        // Check if any nav/sidebar links to it (beyond the guidance banner)
        const settingsPage = await readSource('web/src/routes/settings/index.tsx')
        expect(settingsPage).not.toContain('/cloud/workers')
    })
})

// ============================================================
// WEB-6 (Important): Workers page does not use i18n
// ============================================================
describe('WEB-6: Workers page bypasses i18n', () => {
    it('workers.tsx does not import useTranslation', async () => {
        const source = await readSource('web/src/routes/cloud/workers.tsx')
        expect(source).not.toContain('useTranslation')
        expect(source).not.toMatch(/\bt\(/)
    })
})

// ============================================================
// WEB-7 (Minor): Guidance banner uses <a href> instead of <Link>
// ============================================================
describe('WEB-7: Guidance banner uses full page reload', () => {
    it('CloudSettingsSection uses <a href> for /cloud/workers link', async () => {
        const source = await readSource('web/src/components/NewSession/CloudSettingsSection.tsx')
        // The bug: <a href="/cloud/workers"> causes full reload
        expect(source).toContain('href="/cloud/workers"')
        // Should use <Link to="/cloud/workers"> for SPA navigation
        expect(source).not.toContain("to=\"/cloud/workers\"")
    })
})
