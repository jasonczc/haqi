import { describe, expect, it } from 'vitest'
import { resolveHaqiBinary } from './binaryResolver'

function exists(paths: string[]) {
    return (path: string) => paths.includes(path)
}

describe('resolveHaqiBinary', () => {
    it('prefers packaged resources', () => {
        expect(resolveHaqiBinary({
            isPackaged: true,
            resourcesPath: '/Applications/HAQI.app/Contents/Resources',
            platform: 'darwin',
            arch: 'arm64',
            cwd: '/repo/desktop',
            exists: exists(['/Applications/HAQI.app/Contents/Resources/hapi'])
        })).toEqual({
            kind: 'packaged',
            command: '/Applications/HAQI.app/Contents/Resources/hapi',
            args: []
        })
    })

    it('falls back to host dev binary', () => {
        expect(resolveHaqiBinary({
            platform: 'linux',
            arch: 'x64',
            cwd: '/repo/desktop',
            exists: exists(['/repo/cli/dist-exe/bun-linux-x64-baseline/hapi'])
        })).toEqual({
            kind: 'dev-built',
            command: '/repo/cli/dist-exe/bun-linux-x64-baseline/hapi',
            args: []
        })
    })

    it('falls back to bun source entrypoint in development', () => {
        expect(resolveHaqiBinary({
            platform: 'darwin',
            arch: 'arm64',
            cwd: '/repo/desktop',
            env: { BUN_BIN: '/opt/bun' } as NodeJS.ProcessEnv,
            exists: exists(['/repo/cli/src/index.ts'])
        })).toEqual({
            kind: 'dev-source',
            command: '/opt/bun',
            args: ['/repo/cli/src/index.ts']
        })
    })

    it('uses PATH as final fallback', () => {
        expect(resolveHaqiBinary({
            platform: 'win32',
            arch: 'x64',
            cwd: 'C:\\repo\\desktop',
            exists: () => false
        })).toEqual({
            kind: 'path',
            command: 'haqi',
            args: []
        })
    })
})
