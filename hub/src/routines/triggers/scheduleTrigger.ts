/**
 * Schedule trigger driver.
 *
 * Walks all active schedule-kind routines once a minute; for each
 * routine, decides whether "now" matches its schedule config and, if
 * so, fires via the shared FirePipeline. Uses `dedupKey =
 * <routineId>:<yyyy-mm-ddTHH:MM>` so a minute re-entry (clock skew,
 * leader flap) cannot fire the same routine twice.
 *
 * Today we support two cadences, matching Anthropic's 1-hour minimum:
 *   - `every: 'hour', minute: M`   → fires at HH:MM every hour (UTC)
 *   - `every: 'day', hour: H, minute: M, timezone: 'UTC'|IANA`
 *                                  → fires once a day at HH:MM in `timezone`
 *
 * Upgrade path: swap `shouldFireAt()` for a real cron library (croner,
 * node-cron) when we add 5-field cron expressions. The rest of this
 * file (loop, dedup, fire submission) stays the same.
 */

import {
    ScheduleTriggerConfigSchema,
    type ScheduleTriggerConfig,
    type Routine
} from '@hapi/protocol/schemas'
import type { TriggerContext, TriggerDriver, TriggerHandle } from '../triggerRegistry'

const TICK_INTERVAL_MS = 60_000 // one minute

class ScheduleTriggerDriver implements TriggerDriver<ScheduleTriggerConfig> {
    readonly kind = 'schedule' as const
    readonly configSchema = ScheduleTriggerConfigSchema

    describe(config: ScheduleTriggerConfig): string {
        const mm = String(config.minute).padStart(2, '0')
        if (config.every === 'hour') return `Every hour at :${mm}`
        const hh = String(config.hour ?? 0).padStart(2, '0')
        const tz = config.timezone ?? 'UTC'
        return `Every day at ${hh}:${mm} ${tz}`
    }

    start(ctx: TriggerContext): TriggerHandle {
        let stopped = false
        const timer = setInterval(() => {
            if (stopped) return
            void this.tick(ctx, new Date())
        }, TICK_INTERVAL_MS)
        // Don't keep the process alive just for this loop.
        if (typeof timer.unref === 'function') timer.unref()
        // Also tick once immediately so tests and hot reloads see activity
        // without waiting up to a minute.
        void this.tick(ctx, new Date())
        return {
            stop() {
                stopped = true
                clearInterval(timer)
            }
        }
    }

    /**
     * Exposed for tests: evaluate one clock-tick against a specific
     * `now`. Pure over `ctx.store` / `ctx.firePipeline`.
     */
    async tick(ctx: TriggerContext, now: Date): Promise<void> {
        const routines = ctx.store.routines.listActiveRoutinesByTrigger('schedule')
        for (const routine of routines) {
            if (routine.trigger.kind !== 'schedule') continue
            if (!shouldFireAt(routine.trigger, now)) continue
            const dedup = buildDedupKey(routine.id, now)
            try {
                await ctx.firePipeline.submit({
                    namespace: routine.namespace,
                    routineId: routine.id,
                    triggerKind: 'schedule',
                    actor: { type: 'schedule' },
                    dedupKey: dedup,
                    payload: { firedAt: now.toISOString() }
                })
            } catch (err) {
                ctx.log('[scheduleTrigger] fire failed', {
                    routineId: routine.id,
                    error: err instanceof Error ? err.message : String(err)
                })
            }
        }
    }
}

export const scheduleTriggerDriver = new ScheduleTriggerDriver()

/**
 * Pure scheduling logic. Given a config and a Date, decide whether
 * `now` is inside the one-minute firing window for this routine.
 *
 * Exposed for unit tests.
 */
export function shouldFireAt(config: ScheduleTriggerConfig, now: Date): boolean {
    if (config.every === 'hour') {
        return now.getUTCMinutes() === config.minute
    }
    // every === 'day'
    const tz = config.timezone ?? 'UTC'
    const { hour, minute } = componentsInTimezone(now, tz)
    return hour === (config.hour ?? 0) && minute === config.minute
}

export function buildDedupKey(routineId: string, now: Date): string {
    // Minute-precision key; multiple fires within the same wall-clock
    // minute dedup to the first one.
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(now.getUTCDate()).padStart(2, '0')
    const hh = String(now.getUTCHours()).padStart(2, '0')
    const mi = String(now.getUTCMinutes()).padStart(2, '0')
    return `schedule:${routineId}:${yyyy}-${mm}-${dd}T${hh}:${mi}Z`
}

function componentsInTimezone(now: Date, timezone: string): { hour: number; minute: number } {
    try {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
        const parts = fmt.formatToParts(now)
        const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
        const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
        return {
            hour: Number.isFinite(hour) ? hour % 24 : 0,
            minute: Number.isFinite(minute) ? minute : 0
        }
    } catch {
        // Bad timezone: fall back to UTC so the routine still fires predictably.
        return { hour: now.getUTCHours(), minute: now.getUTCMinutes() }
    }
}

// Type-only export for tests that want to poke at the driver instance.
export type _ScheduleTriggerDriver = ScheduleTriggerDriver
export function _buildSchedulePayload(routine: Routine, now: Date): unknown {
    return { firedAt: now.toISOString(), routineId: routine.id }
}
