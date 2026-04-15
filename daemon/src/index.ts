import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { startServer } from './server'
import { DesktopManager } from './desktop/vnc'

const execFileAsync = promisify(execFile)
const port = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') ?? '9876', 10)
const authToken = process.argv.find((_, i, a) => a[i - 1] === '--auth-token') ?? process.env.HAQI_DAEMON_AUTH_TOKEN ?? ''

if (!authToken) {
    console.error('--auth-token or HAQI_DAEMON_AUTH_TOKEN required')
    process.exit(1)
}

try {
    await execFileAsync('haqi-start-inner-docker', [], {
        env: process.env
    })
    console.log('Inner Docker ready')
} catch (error) {
    console.error('Failed to start inner Docker:', error instanceof Error ? error.message : String(error))
    process.exit(1)
}

const server = await startServer({ port, authToken })

const desktop = new DesktopManager()
try {
    await desktop.start()
    console.log('Desktop environment started')
} catch (err) {
    console.warn('Desktop environment failed to start (may not be available):', err)
}

process.on('SIGINT', () => { server.stop(); desktop.stop(); process.exit(0) })
process.on('SIGTERM', () => { server.stop(); desktop.stop(); process.exit(0) })
