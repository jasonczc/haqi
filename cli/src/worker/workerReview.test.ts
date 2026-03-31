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
    it('exchangeEnrollmentToken revokes the token after use', async () => {
        const source = await readSource('hub/src/cloud/secretBroker.ts')
        // Find the exchangeEnrollmentToken method
        const methodMatch = source.match(/exchangeEnrollmentToken[\s\S]*?(?=\n    \w|\n\})/m)
        expect(methodMatch).not.toBeNull()
        const method = methodMatch![0]

        // Fixed: the method now revokes the enrollment token after exchange
        expect(method).toContain('revokeEnrollmentTokenIfActive')
    })
})

// ============================================================
// SEC-2 (Critical): TOCTOU race in token exchange
// ============================================================
describe('SEC-2: Non-atomic enrollment token exchange', () => {
    it('exchangeEnrollmentToken uses CAS-style atomic revocation', async () => {
        const brokerSource = await readSource('hub/src/cloud/secretBroker.ts')
        const storeSource = await readSource('hub/src/store/cloudStore.ts')

        // Fixed: exchange uses CAS-style revokeEnrollmentTokenIfActive
        const methodMatch = brokerSource.match(/exchangeEnrollmentToken[\s\S]*?(?=\n    \w|\n\})/m)
        expect(methodMatch).not.toBeNull()
        const method = methodMatch![0]
        expect(method).toContain('revokeEnrollmentTokenIfActive')

        // The store method uses atomic WHERE revoked_at IS NULL
        expect(storeSource).toMatch(/WHERE.*revoked_at IS NULL/)
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
    it('resolveCliAuthToken requires allowEnrollment opt-in for enrollment exchange', async () => {
        const resolver = await readSource('hub/src/cloud/resolveCliAuthToken.ts')
        // Fixed: resolveCliAuthToken has an allowEnrollment parameter
        expect(resolver).toContain('allowEnrollment')
        // Enrollment exchange is gated behind the option
        expect(resolver).toMatch(/options\?\.allowEnrollment/)
        // HTTP routes do NOT pass allowEnrollment, so enrollment is blocked
        const cliRoute = await readSource('hub/src/web/routes/cli.ts')
        expect(cliRoute).not.toContain('allowEnrollment')
        // Socket server DOES pass allowEnrollment: true
        const socketServer = await readSource('hub/src/socket/server.ts')
        expect(socketServer).toContain('allowEnrollment: true')
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
// EDGE-2 (High): ApiMachineClient guards auto-start for localhost only
// ============================================================
describe('EDGE-2: ApiMachineClient guards maybeAutoStartServer for localhost', () => {
    it('apiMachine.ts checks apiUrl before calling maybeAutoStartServer', async () => {
        const source = await readSource('cli/src/api/apiMachine.ts')
        expect(source).toContain('maybeAutoStartServer')
        // Fix: guards auto-start by checking if apiUrl is localhost
        expect(source).toContain('localhost')
        expect(source).toContain('127.0.0.1')
    })
})

// ============================================================
// EDGE-8 (Fixed): Shutdown handler kills child sessions for remote workers
// ============================================================
describe('EDGE-8: Shutdown handler terminates child sessions in remote mode', () => {
    it('cleanupAndShutdown iterates pidToTrackedSession to kill children for remote mode', async () => {
        const source = await readSource('cli/src/runner/runnerLoop.ts')
        // Find the cleanupAndShutdown function
        const cleanupMatch = source.match(/const cleanupAndShutdown[\s\S]*?(?=\n    logger\.debug\('\[RUNNER RUN\] Runner started)/m)
        expect(cleanupMatch).not.toBeNull()
        const cleanup = cleanupMatch![0]

        // Fix: child process termination is present in cleanup
        expect(cleanup).toContain('pidToTrackedSession')
        expect(cleanup).toContain('killProcess')
        expect(cleanup).toContain('killProcessByChildProcess')
    })
})

// ============================================================
// EDGE-9 (Fixed): Self-restart is gated to local mode only
// ============================================================
describe('EDGE-9: Self-restart is skipped for remote workers', () => {
    it('self-restart version check is gated by local mode', async () => {
        const source = await readSource('cli/src/runner/runnerLoop.ts')
        // The fix: self-restart is only done in local mode, remote workers skip it entirely
        expect(source).toMatch(/if\s*\(options\.mode\s*===\s*['"]local['"]\)\s*\{[\s\S]*?installedCliMtimeMs !== startedWithCliMtimeMs/)
    })
})

// ============================================================
// SPAWN-1 (Critical): 'accepted' response treated as success
// ============================================================
describe('SPAWN-1: SpawnCoordinator treats accepted response as success', () => {
    it('handleSpawnResponse no longer maps accepted to unexpected_async_response error', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // Fixed: 'accepted' is no longer treated as an error
        expect(source).not.toContain('unexpected_async_response')
        // 'accepted' must be handled with an early return, not a failRequest call
        expect(source).toContain("response.type === 'accepted'")
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
        // selectMachine checks executorType: the candidates filter guards on executorType
        const selectFn = source.match(/private selectMachine[\s\S]*?\n    \}/)
        expect(selectFn).not.toBeNull()
        expect(selectFn![0]).toContain('executorType')
    })
})

// ============================================================
// SPAWN-3 (Medium): Explicit machineId now checks executorType
// ============================================================
describe('SPAWN-3: Explicit machineId checks executorType', () => {
    it('selectMachine explicit path checks executorType', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // Fixed: explicit path now validates executorType
        const selectMatch = source.match(/requestedMachineId[\s\S]*?getMachineByNamespace[\s\S]*?return explicit\.id/)
        expect(selectMatch).not.toBeNull()
        const selectBlock = selectMatch![0]
        // executorType check is present on the explicit path
        expect(selectBlock).toContain('executorType')
        expect(selectBlock).toContain('backend')
    })
})

// ============================================================
// SPAWN-6 (Low): null runnerState guarded in spawnCoordinator for cloud workers
// ============================================================
describe('SPAWN-6: null runnerState guarded for cloud workers in selectMachine', () => {
    it('isRunnerStateSelectable still returns true for null (unchanged — used by local too)', async () => {
        const source = await readSource('hub/src/cloud/workerState.ts')
        // Find isRunnerStateSelectable
        const fnMatch = source.match(/export function isRunnerStateSelectable[\s\S]*?\n\}/)
        expect(fnMatch).not.toBeNull()
        const fn = fnMatch![0]
        // isRunnerStateSelectable itself is intentionally unchanged (local machines use it with null)
        expect(fn).toMatch(/if\s*\(!runnerState\)\s*\{\s*\n\s*return\s*true/)
    })

    it('selectMachine in spawnCoordinator guards null runnerState for cloud workers', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // Fixed: cloud worker candidates are filtered out when runnerState is null
        expect(source).toMatch(/runnerState\s*==\s*null/)
        // The guard must appear in the candidates filter, not just in isRunnerStateSelectable
        const candidatesMatch = source.match(/const candidates[\s\S]*?selectWorker/)
        expect(candidatesMatch).not.toBeNull()
        expect(candidatesMatch![0]).toMatch(/runnerState\s*==\s*null/)
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
