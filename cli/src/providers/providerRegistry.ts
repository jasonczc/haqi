import type { MappingProviderController, ProviderSettings } from './types'
import { NgrokProviderController } from './ngrok'

export function getProviderController(provider: string, settings: ProviderSettings): MappingProviderController {
    if (provider === 'ngrok') {
        return new NgrokProviderController(settings.ngrok ?? {})
    }
    throw new Error(`Unsupported provider: ${provider}`)
}
