import { describe, it, expect } from 'bun:test'
import { parseListeningPorts } from './detector'

describe('parseListeningPorts', () => {
    it('parses ss output for listening TCP ports', () => {
        const ssOutput = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      128          0.0.0.0:3000       0.0.0.0:*    users:(("node",pid=1234,fd=20))
LISTEN 0      128          0.0.0.0:9876       0.0.0.0:*    users:(("haqi-daemon",pid=1,fd=10))
LISTEN 0      128       [::1]:5173          [::]:*    users:(("vite",pid=5678,fd=15))`

        const ports = parseListeningPorts(ssOutput, [9876])
        expect(ports).toHaveLength(2)
        expect(ports[0]).toEqual({ port: 3000, pid: 1234, process: 'node' })
        expect(ports[1]).toEqual({ port: 5173, pid: 5678, process: 'vite' })
    })

    it('returns empty array for no listeners', () => {
        const ports = parseListeningPorts('', [9876])
        expect(ports).toEqual([])
    })

    it('filters excluded ports', () => {
        const ssOutput = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      128          0.0.0.0:3000       0.0.0.0:*    users:(("node",pid=1234,fd=20))
LISTEN 0      128          0.0.0.0:4000       0.0.0.0:*    users:(("app",pid=5678,fd=10))`

        const ports = parseListeningPorts(ssOutput, [3000, 4000])
        expect(ports).toEqual([])
    })
})
