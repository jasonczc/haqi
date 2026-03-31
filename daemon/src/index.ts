import { startServer } from './server'

const port = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') ?? '9876', 10)
const authToken = process.argv.find((_, i, a) => a[i - 1] === '--auth-token') ?? process.env.HAQI_DAEMON_AUTH_TOKEN ?? ''

if (!authToken) {
    console.error('--auth-token or HAQI_DAEMON_AUTH_TOKEN required')
    process.exit(1)
}

const server = await startServer({ port, authToken })

process.on('SIGINT', () => { server.stop(); process.exit(0) })
process.on('SIGTERM', () => { server.stop(); process.exit(0) })
