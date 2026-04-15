import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const createdDirs: string[] = []

describe('getDesktopEnv', () => {
    afterEach(() => {
        delete process.env.HAQI_DESKTOP_ENV_FILE
        delete process.env.DBUS_SESSION_BUS_ADDRESS
        delete process.env.XDG_RUNTIME_DIR
        for (const dir of createdDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('merges desktop session env from the persisted file', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'haqi-desktop-env-'))
        createdDirs.push(dir)
        const envFile = join(dir, 'desktop.env')
        writeFileSync(envFile, [
            'DISPLAY=:9',
            'DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/dbus-test,guid=abc',
            'XDG_RUNTIME_DIR=/tmp/xdg-runtime-test',
            'SSH_AUTH_SOCK=/tmp/ssh.sock'
        ].join('\n'))

        process.env.HAQI_DESKTOP_ENV_FILE = envFile
        process.env.DISPLAY = ''

        const { getDesktopEnv } = await import('./desktopEnv')
        const env = getDesktopEnv()

        expect(env.DISPLAY).toBe(':9')
        expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/tmp/dbus-test,guid=abc')
        expect(env.XDG_RUNTIME_DIR).toBe('/tmp/xdg-runtime-test')
        expect(env.SSH_AUTH_SOCK).toBe('/tmp/ssh.sock')
    })
})
