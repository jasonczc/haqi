import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function platformBinPath(): string {
    const binaryName = process.platform === 'win32' ? 'hapi.exe' : 'hapi'
    if (process.platform === 'darwin') {
        const target = process.arch === 'arm64' ? 'bun-darwin-arm64' : 'bun-darwin-x64'
        return resolve(__dirname, '..', 'cli', 'dist-exe', target, binaryName)
    }
    if (process.platform === 'win32') {
        return resolve(__dirname, '..', 'cli', 'dist-exe', 'bun-windows-x64', binaryName)
    }
    if (process.platform === 'linux') {
        const target = process.arch === 'arm64' ? 'bun-linux-arm64' : 'bun-linux-x64-baseline'
        return resolve(__dirname, '..', 'cli', 'dist-exe', target, binaryName)
    }
    throw new Error(`Unsupported desktop build platform: ${process.platform}/${process.arch}`)
}

const config: ForgeConfig = {
    packagerConfig: {
        name: 'HAQI',
        executableName: 'HAQI',
        appBundleId: 'run.hapi.desktop',
        appCategoryType: 'public.app-category.developer-tools',
        asar: true,
        extraResource: [platformBinPath()],
        protocols: [
            {
                name: 'HAQI',
                schemes: ['haqi']
            }
        ]
    },
    makers: [
        new MakerDMG({ name: 'HAQI' }, ['darwin']),
        new MakerSquirrel({ name: 'haqi' }, ['win32']),
        new MakerZIP({}, ['darwin', 'win32'])
    ],
    plugins: [
        new VitePlugin({
            build: [
                {
                    entry: 'src/main.ts',
                    config: 'vite.main.config.ts',
                    target: 'main'
                },
                {
                    entry: 'src/preload.ts',
                    config: 'vite.preload.config.ts',
                    target: 'preload'
                }
            ],
            renderer: []
        }),
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.OnlyLoadAppFromAsar]: true
        })
    ]
}

export default config
