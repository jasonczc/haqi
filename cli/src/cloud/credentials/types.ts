export type CredentialKind =
    | 'claude'      // ~/.claude/.credentials.json (+ settings.json)
    | 'codex'       // ~/.codex/auth.json (+ config.toml)
    | 'gitconfig'   // ~/.gitconfig (stripped of host [user] section)
    | 'gitcreds'    // ~/.git-credentials (or synthesized from GitHub token)
    | 'gh'          // ~/.config/gh/ (with oauth_token merged in)
    | 'ssh'         // ~/.ssh/{known_hosts,config,id_*}

export const CREDENTIAL_KINDS: readonly CredentialKind[] = [
    'claude', 'codex', 'gitconfig', 'gitcreds', 'gh', 'ssh',
]

export type ContainerTarget = {
    containerId: string
    user?: string
}

export type CredentialStatus = {
    kind: CredentialKind
    present: boolean
    sources: string[]
    expiresAt?: number
    note?: string
}

export interface CredentialProvider {
    readonly kind: CredentialKind
    status(): Promise<CredentialStatus>
    inject(target: ContainerTarget): Promise<void>
}
