// cli/src/cloud/docker/containerManager.ts
import { runDockerCommand, DockerCliRuntime } from './dockerCli'

export type ContainerInfo = {
    id: string
    name: string
    status: string
    workspaceId: string
    runtime: string
    ports: string
    createdAt?: string
}

export async function listHaqiContainers(): Promise<ContainerInfo[]> {
    const result = await runDockerCommand([
        'ps', '-a',
        '--filter', 'label=haqi.runtime',
        '--format', '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Label "haqi.workspace_id"}}\t{{.Label "haqi.runtime"}}\t{{.Ports}}\t{{.CreatedAt}}'
    ])
    return result.stdout.trim().split('\n').filter(Boolean).map(line => {
        const [id, name, status, workspaceId, runtime, ports, createdAt] = line.split('\t')
        return {
            id: id ?? '',
            name: name ?? '',
            status: status ?? '',
            workspaceId: workspaceId ?? '',
            runtime: runtime ?? '',
            ports: ports ?? '',
            createdAt
        }
    })
}

export async function stopSessionInContainer(containerId: string): Promise<void> {
    const runtime = new DockerCliRuntime()
    const inspect = await runtime.inspect(containerId)
    const daemonPort = inspect.portBindings[9876]
    if (!daemonPort) {
        throw new Error('No daemon port found — container may not be a daemon-session')
    }
    // Read auth token from container env
    const envResult = await runtime.exec({
        containerId,
        command: ['printenv', 'HAQI_DAEMON_AUTH_TOKEN'],
        workingDir: '/'
    })
    const authToken = envResult.stdout.trim()
    if (!authToken) {
        throw new Error('Cannot read daemon auth token from container')
    }
    // Call daemon API to kill the process
    const response = await fetch(`http://127.0.0.1:${daemonPort}/process/kill`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    if (!response.ok) {
        throw new Error(`Daemon kill failed: ${response.status}`)
    }
}

export async function cleanStoppedContainers(): Promise<string[]> {
    const result = await runDockerCommand([
        'ps', '-a', '-q',
        '--filter', 'label=haqi.runtime',
        '--filter', 'status=exited'
    ]).catch(() => ({ stdout: '', stderr: '' }))
    const ids = result.stdout.trim().split('\n').filter(Boolean)
    const runtime = new DockerCliRuntime()
    const removed: string[] = []
    for (const id of ids) {
        await runtime.remove(id).catch(() => {})
        removed.push(id)
    }
    return removed
}
