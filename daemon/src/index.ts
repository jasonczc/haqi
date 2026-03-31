const port = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') ?? '9876', 10)
const authToken = process.argv.find((_, i, a) => a[i - 1] === '--auth-token') ?? process.env.HAQI_DAEMON_AUTH_TOKEN ?? ''

if (!authToken) {
    console.error('--auth-token or HAQI_DAEMON_AUTH_TOKEN required')
    process.exit(1)
}

console.log(`haqi-daemon starting on port ${port}`)

// Server will be added in Task 3
import { startServer } from './server'
startServer({ port, authToken })
