import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ResolvedBinary {
    kind: 'packaged' | 'dev-built' | 'dev-source' | 'path'
    command: string
    args: string[]
}

export interface BinaryResolverOptions {
    isPackaged?: boolean
    resourcesPath?: string
    platform?: NodeJS.Platform
    arch?: string
    cwd?: string
    exists?: (path: string) => boolean
    env?: NodeJS.ProcessEnv
}

function getBinaryName(platform: NodeJS.Platform): string {
    return platform === 'win32' ? 'hapi.exe' : 'hapi'
}

function getHostTarget(platform: NodeJS.Platform, arch: string): string | null {
    if (platform === 'darwin') {
        return arch === 'arm64' ? 'bun-darwin-arm64' : 'bun-darwin-x64'
    }
    if (platform === 'linux') {
        return arch === 'arm64' ? 'bun-linux-arm64' : 'bun-linux-x64-baseline'
    }
    if (platform === 'win32') {
        return 'bun-windows-x64'
    }
    return null
}

export function resolveHaqiBinary(options: BinaryResolverOptions = {}): ResolvedBinary {
    const platform = options.platform ?? process.platform
    const arch = options.arch ?? process.arch
    const cwd = options.cwd ?? process.cwd()
    const fileExists = options.exists ?? existsSync
    const env = options.env ?? process.env
    const binaryName = getBinaryName(platform)

    if (options.isPackaged && options.resourcesPath) {
        const packagedPath = resolve(options.resourcesPath, binaryName)
        if (fileExists(packagedPath)) {
            return { kind: 'packaged', command: packagedPath, args: [] }
        }
    }

    const target = getHostTarget(platform, arch)
    if (target) {
        const builtPath = resolve(cwd, '..', 'cli', 'dist-exe', target, binaryName)
        if (fileExists(builtPath)) {
            return { kind: 'dev-built', command: builtPath, args: [] }
        }
    }

    const sourceEntrypoint = resolve(cwd, '..', 'cli', 'src', 'index.ts')
    if (fileExists(sourceEntrypoint)) {
        return {
            kind: 'dev-source',
            command: env.BUN_BIN || 'bun',
            args: [sourceEntrypoint]
        }
    }

    return { kind: 'path', command: 'haqi', args: [] }
}
