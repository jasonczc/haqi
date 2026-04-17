/**
 * Default driver registrations.
 *
 * Same pattern as cli/src/computerUse/registry.ts — one-shot side-effect
 * imports that register every known driver. Call once at hub boot before
 * starting any driver via its start(ctx).
 */

import { triggerRegistry } from './triggerRegistry'
import { apiTriggerDriver } from './triggers/apiTrigger'
import { scheduleTriggerDriver } from './triggers/scheduleTrigger'

let registered = false

export function registerDefaultTriggerDrivers(): void {
    if (registered) return
    registered = true
    triggerRegistry.register(apiTriggerDriver)
    triggerRegistry.register(scheduleTriggerDriver)
}
