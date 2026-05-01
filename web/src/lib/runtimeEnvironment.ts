export function isElectronUserAgent(userAgent: string): boolean {
    return /\bElectron\//.test(userAgent)
}

export function isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && isElectronUserAgent(window.navigator.userAgent)
}
