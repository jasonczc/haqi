/**
 * Trigger driver registry.
 *
 * A "driver" is the bridge between an external event source (cron,
 * webhook, API hit) and the FirePipeline. Each driver:
 *
 *   1. Declares the shape of its per-routine config (validated at
 *      routine create time against this driver's configSchema).
 *   2. On `start()`, registers whatever it needs on the hub (HTTP
 *      route, scheduler tick, queue listener) and returns a TriggerHandle
 *      whose `stop()` tears it down. Stopping is idempotent.
 *   3. On an external event, calls `ctx.firePipeline.submit(fireRequest)`
 *      — it never writes to the DB directly or spawns anything itself.
 *
 * Adding a new trigger = implement TriggerDriver, register it via
 * `triggerRegistry.register(driver)` before hub start. No other module
 * changes. Same pattern as cli/src/computerUse/adapter.ts.
 */

import type { z } from 'zod'
import type { TriggerKind } from '@hapi/protocol/schemas'
import type { FirePipeline, FireSubmitRequest, FireSubmitResult } from './firePipeline'
import type { Store } from '../store'
import type { EventPublisher } from '../sync/eventPublisher'

/**
 * Triggers only need `.submit(request)` — narrowing the context down to
 * that lets us swap between FirePipeline implementations (legacy vs.
 * Effect-backed) without each driver caring.
 */
export type FirePipelineSubmit = {
    submit: (req: FireSubmitRequest) => Promise<FireSubmitResult>
}

export interface TriggerContext {
    store: Store
    firePipeline: FirePipelineSubmit
    eventPublisher: EventPublisher
    /** Logs prefixed for the driver, writes to hub stdout. */
    log: (message: string, details?: unknown) => void
}

// Back-compat type re-export for callers that used `FirePipeline`.
export type { FirePipeline }

export interface TriggerHandle {
    stop(): Promise<void> | void
}

export interface TriggerDriver<TConfig = unknown> {
    readonly kind: TriggerKind
    /** zod schema for the routine's per-driver config body. */
    readonly configSchema: z.ZodType<TConfig>
    /**
     * Human summary for listings: "Every day at 09:00 UTC" / "API fire".
     * Cheap so the UI and diagnostics can call on hot paths.
     */
    describe(config: TConfig): string
    /**
     * Start the driver's listener. Called once on hub boot. Returns a
     * handle whose stop() is called on graceful shutdown. Drivers that
     * don't have persistent listeners (e.g., ApiTrigger just relies on
     * the HTTP route existing) can return a no-op handle.
     */
    start(ctx: TriggerContext): Promise<TriggerHandle> | TriggerHandle
}

class TriggerRegistryImpl {
    private readonly drivers = new Map<TriggerKind, TriggerDriver<unknown>>()

    register<T>(driver: TriggerDriver<T>): void {
        const existing = this.drivers.get(driver.kind)
        if (existing) {
            // Last-wins with a warn so tests can override; unexpected
            // duplicate registrations surface via stderr.
            process.stderr.write(
                `[routines] Overriding trigger driver for ${driver.kind}\n`
            )
        }
        this.drivers.set(driver.kind, driver as TriggerDriver<unknown>)
    }

    get(kind: TriggerKind): TriggerDriver<unknown> | null {
        return this.drivers.get(kind) ?? null
    }

    list(): TriggerDriver<unknown>[] {
        return Array.from(this.drivers.values())
    }

    /** Test helper; production path uses register() for idempotency. */
    clear(): void {
        this.drivers.clear()
    }
}

export const triggerRegistry = new TriggerRegistryImpl()
export type TriggerRegistry = typeof triggerRegistry
