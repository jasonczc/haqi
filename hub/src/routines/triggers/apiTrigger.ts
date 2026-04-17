/**
 * API trigger driver.
 *
 * Doesn't register any hub-side listeners — the fire path is a generic
 * HTTP route (`POST /api/routines/:id/fire`) that calls the shared
 * FirePipeline with a pre-authenticated actor. The driver still exists
 * so the registry has a consistent surface: config schema, describe(),
 * and a no-op start().
 *
 * Authentication lives in fireTokenService.ts; the route pulls the
 * bearer, calls verifyFireToken, and only then invokes the pipeline.
 */

import { ApiTriggerConfigSchema, type ApiTriggerConfig } from '@hapi/protocol/schemas'
import type { TriggerDriver, TriggerHandle } from '../triggerRegistry'

class ApiTriggerDriver implements TriggerDriver<ApiTriggerConfig> {
    readonly kind = 'api' as const
    readonly configSchema = ApiTriggerConfigSchema

    describe(_config: ApiTriggerConfig): string {
        return 'API — POST /api/routines/:id/fire'
    }

    start(): TriggerHandle {
        // No hub-side listener. The HTTP route in web/routes/routines.ts
        // invokes the FirePipeline directly on authenticated requests.
        return { stop() {} }
    }
}

export const apiTriggerDriver = new ApiTriggerDriver()
