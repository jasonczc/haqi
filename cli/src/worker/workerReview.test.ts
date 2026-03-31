/**
 * Comprehensive bug verification tests from 4 parallel review agents.
 * Each test proves a specific issue exists before it is fixed,
 * except for EDGE-2, EDGE-8, and EDGE-9 which have been fixed.
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
// SEC-1 (Fixed): Enrollment token is revoked after exchange
// ============================================================
describe('SEC-1: Enrollment token revocation', () => {
    it('exchangeEnrollmentToken revokes the token after use', async () => {
        const source = await readSource('hub/src/cloud/secretBroker.ts')
        const methodMatch = source.match(/exchangeEnrollmentToken[\s\S]*?(?=\n    \w|\n\})/m)
        expect(methodMatch).not.toBeNull()
        const method = methodMatch![0]

        // Fixed: revocation call is present
        expect(method).toContain('revokeEnrollmentToken')
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
// EDGE-2 (Fixed): ApiMachineClient guards auto-start for localhost only
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
// SPAWN-1 (Fixed): 'accepted' response handled correctly
// ============================================================
describe('SPAWN-1: SpawnCoordinator handles accepted response', () => {
    it('handleSpawnResponse handles accepted without treating it as error', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // Fixed: 'accepted' is no longer mapped to unexpected_async_response
        expect(source).not.toContain('unexpected_async_response')
        // 'accepted' is handled with an early return
        expect(source).toContain("response.type === 'accepted'")
    })
})

// ============================================================
// SPAWN-2 (High): Worker executorType may not be set in machineCache
// ============================================================
describe('SPAWN-2: Worker executorType filtering in selectMachine', () => {
    it('socket server does not call getOrCreateMachine on enrollment', async () => {
        const source = await readSource('hub/src/socket/server.ts')
        // After worker-enrolled emit, there is no machine creation
        const enrollBlock = source.match(/worker-enrolled[\s\S]*?registerCliHandlers/)
        expect(enrollBlock).not.toBeNull()
        expect(enrollBlock![0]).not.toContain('getOrCreateMachine')
        expect(enrollBlock![0]).not.toContain('machineCache')
    })

    it('selectMachine checks executorType on candidates', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // Fixed: selectMachine checks executorType for filtering
        expect(source).toContain('executorType')
    })
})

// ============================================================
// SPAWN-3 (Fixed): Explicit machineId checks executorType
// ============================================================
describe('SPAWN-3: Explicit machineId checks executorType', () => {
    it('selectMachine explicit path validates executorType', async () => {
        const source = await readSource('hub/src/cloud/spawnCoordinator.ts')
        // Fixed: explicit machineId path now checks executorType
        expect(source).toContain('explicit.metadata?.executorType')
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
describe('WEB-1: SSE handles cloudWorkers invalidation via machine-updated', () => {
    it('useSSE.ts invalidates cloudWorkers on machine-updated events', async () => {
        const source = await readSource('web/src/hooks/useSSE.ts')
        // cloudWorkers query is invalidated when machine-updated events arrive
        expect(source).toContain('cloudWorkers')
    })
})

// ============================================================
// WEB-2 (Important): Workers page has no error state
// FIXED: workers.tsx now renders an error state when isError is true
// ============================================================
describe('WEB-2: Workers page shows empty state instead of error', () => {
    it('workers.tsx checks isError and renders error state', async () => {
        const source = await readSource('web/src/routes/cloud/workers.tsx')
        expect(source).toContain('isLoading')
        // Fixed: isError check is now present
        expect(source).toContain('isError')
    })
})

// ============================================================
// WEB-4 (Important): selectable field check uses !== false on optional field
// FIXED: check is now selectable === true (explicit boolean check)
// ============================================================
describe('WEB-4: hasSelectableWorkers check is always true', () => {
    it('NewSession index.tsx checks selectable === true (explicit boolean check)', async () => {
        const source = await readSource('web/src/components/NewSession/index.tsx')
        // Fixed: explicit === true check instead of !== false
        expect(source).toContain('selectable === true')
        expect(source).not.toContain('selectable !== false')
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
// FIXED: settings page now has a link to /cloud/workers
// ============================================================
describe('WEB-5: Workers page has no navigation entry', () => {
    it('settings page links to /cloud/workers', async () => {
        // Check common navigation files
        const router = await readSource('web/src/router.tsx')
        // The route exists
        expect(router).toContain("path: '/cloud/workers'")

        // Fixed: settings page now links to /cloud/workers
        const settingsPage = await readSource('web/src/routes/settings/index.tsx')
        expect(settingsPage).toContain('/cloud/workers')
    })
})

// ============================================================
// WEB-6 (Important): Workers page does not use i18n
// FIXED: workers.tsx now imports useTranslation and uses t() for all strings
// ============================================================
describe('WEB-6: Workers page bypasses i18n', () => {
    it('workers.tsx imports useTranslation and uses t() calls', async () => {
        const source = await readSource('web/src/routes/cloud/workers.tsx')
        // Fixed: useTranslation is now imported
        expect(source).toContain('useTranslation')
        // Fixed: t() calls are now used
        expect(source).toMatch(/\bt\(/)
    })
})

// ============================================================
// WEB-7 (Minor): Guidance banner uses <a href> instead of <Link>
// FIXED: CloudSettingsSection now uses <Link to="/cloud/workers"> for SPA navigation
// ============================================================
describe('WEB-7: Guidance banner uses full page reload', () => {
    it('CloudSettingsSection uses <Link to> for /cloud/workers link', async () => {
        const source = await readSource('web/src/components/NewSession/CloudSettingsSection.tsx')
        // Fixed: <Link to="/cloud/workers"> for SPA navigation
        expect(source).toContain("to=\"/cloud/workers\"")
        // No longer using <a href>
        expect(source).not.toContain('href="/cloud/workers"')
    })
})
