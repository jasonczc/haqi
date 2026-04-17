/**
 * Entry points for the routines subsystem.
 *
 *   bootRoutines(deps)  — call once after Store + SpawnCoordinator + EventPublisher
 *                         are ready. Registers drivers, starts run tracker,
 *                         starts each driver. Returns a stop handle.
 *
 * Each concern (filter evaluator, fire pipeline, trigger registry, run
 * tracker) is importable on its own for tests.
 */

import type { Store } from '../store'
import type { EventPublisher } from '../sync/eventPublisher'
import type { SpawnCoordinatorLike } from './firePipeline'
import { FirePipeline } from './firePipeline'
import { EffectFirePipeline } from './effect/EffectFirePipeline'
import { startRunTracker, type RunTrackerHandle } from './runTracker'
import { triggerRegistry, type TriggerContext, type TriggerHandle } from './triggerRegistry'
import { registerDefaultTriggerDrivers } from './defaults'

export { evaluateFilter, readPath } from './filterEvaluator'
export type { EvaluateResult } from './filterEvaluator'
export { FirePipeline } from './firePipeline'
export { EffectFirePipeline } from './effect/EffectFirePipeline'
export type {
    FireSubmitRequest,
    FireSubmitResult,
    SkipReason,
    SpawnCoordinatorLike
} from './firePipeline'
export { triggerRegistry } from './triggerRegistry'
export type { TriggerContext, TriggerDriver, TriggerHandle } from './triggerRegistry'
export { apiTriggerDriver } from './triggers/apiTrigger'
export {
    scheduleTriggerDriver,
    shouldFireAt,
    buildDedupKey
} from './triggers/scheduleTrigger'
export { registerDefaultTriggerDrivers } from './defaults'
export {
    issueFireToken,
    verifyFireToken,
    hashFireToken,
    previewFireToken
} from './fireTokenService'
export type { IssuedFireToken, TokenVerificationResult } from './fireTokenService'

export type RoutinesBackend = 'legacy' | 'effect'

export type RoutinesSubsystemHandle = {
    /** The active pipeline. Both backends expose the same submit() shape. */
    firePipeline: { submit: FirePipeline['submit'] }
    /** Only set when backend === 'effect'. Lets RunTracker / external hooks resolve the terminal deferred. */
    effectPipeline?: EffectFirePipeline
    backend: RoutinesBackend
    stop(): Promise<void> | void
}

export async function bootRoutines(deps: {
    store: Store
    spawnCoordinator: SpawnCoordinatorLike
    eventPublisher: EventPublisher
    /** 'effect' uses @effect/workflow-backed durable execution; 'legacy' is the original ad-hoc state machine. Default: legacy (env-overridable). */
    backend?: RoutinesBackend
    /** Absolute path to the workflow engine's dedicated SQLite file. Required when backend === 'effect'. */
    effectDbPath?: string
    log?: (msg: string, data?: unknown) => void
}): Promise<RoutinesSubsystemHandle> {
    registerDefaultTriggerDrivers()
    const log = deps.log ?? (() => {})
    const backend: RoutinesBackend =
        deps.backend
        ?? (process.env.HAQI_ROUTINES_BACKEND === 'effect' ? 'effect' : 'legacy')

    let firePipeline: { submit: FirePipeline['submit'] }
    let effectPipeline: EffectFirePipeline | undefined
    if (backend === 'effect') {
        if (!deps.effectDbPath) {
            throw new Error('bootRoutines: effectDbPath is required when backend=effect')
        }
        effectPipeline = new EffectFirePipeline({
            store: deps.store,
            spawnCoordinator: deps.spawnCoordinator,
            eventPublisher: deps.eventPublisher,
            dbPath: deps.effectDbPath
        })
        firePipeline = effectPipeline
        log('[routines] booted with backend=effect')
    } else {
        firePipeline = new FirePipeline(
            deps.store,
            deps.spawnCoordinator,
            deps.eventPublisher
        )
        log('[routines] booted with backend=legacy')
    }
    const tracker: RunTrackerHandle = startRunTracker({
        store: deps.store,
        eventPublisher: deps.eventPublisher,
        log
    })
    const triggerCtx: TriggerContext = {
        store: deps.store,
        firePipeline,
        eventPublisher: deps.eventPublisher,
        log
    }
    const handles: TriggerHandle[] = []
    for (const driver of triggerRegistry.list()) {
        try {
            const handle = await driver.start(triggerCtx)
            handles.push(handle)
            log(`[routines] started trigger driver ${driver.kind}`)
        } catch (err) {
            log(`[routines] failed to start trigger driver ${driver.kind}`, err)
        }
    }
    return {
        firePipeline,
        effectPipeline,
        backend,
        stop: async () => {
            tracker.stop()
            for (const handle of handles) {
                try { await handle.stop() } catch {}
            }
            if (effectPipeline) {
                await effectPipeline.stop()
            }
        }
    }
}
