import type { CredentialKind, CredentialProvider } from '../types'
import { claudeProvider } from './claude'
import { codexProvider } from './codex'
import { gitconfigProvider } from './gitconfig'
import { gitcredsProvider } from './gitcreds'
import { ghProvider } from './gh'
import { sshProvider } from './ssh'

/**
 * Order matters: gitconfig must run before gitcreds (so credential.helper is
 * set to "store" before .git-credentials is written), and before gh (so the
 * gh CLI's .gitconfig fixups don't overwrite ours).
 */
export const ALL_PROVIDERS: readonly CredentialProvider[] = [
    claudeProvider,
    codexProvider,
    gitconfigProvider,
    gitcredsProvider,
    ghProvider,
    sshProvider,
]

const BY_KIND: ReadonlyMap<CredentialKind, CredentialProvider> = new Map(
    ALL_PROVIDERS.map(p => [p.kind, p])
)

export function getProvider(kind: CredentialKind): CredentialProvider | undefined {
    return BY_KIND.get(kind)
}

export {
    claudeProvider,
    codexProvider,
    gitconfigProvider,
    gitcredsProvider,
    ghProvider,
    sshProvider,
}
