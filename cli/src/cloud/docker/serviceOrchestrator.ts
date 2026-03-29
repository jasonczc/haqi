import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EnvironmentService, PreviewTarget } from '@hapi/protocol/types'
import type { DockerCliPortBinding, DockerCliRuntime } from './dockerCli'
import type { ServiceEndpoint, ServiceRuntimeHandle } from '@/cloud/types'

export type StartedService = {
    service: EnvironmentService
    containerId: string
    env: Record<string, string>
    previews: PreviewTarget[]
    tempFiles: string[]
    handle: ServiceRuntimeHandle
}

function sanitizeName(input: string): string {
    return input.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'service'
}

function inferEnvKey(serviceName: string, port: number): string {
    return `${sanitizeName(serviceName).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${port}`
}

export class DockerServiceOrchestrator {
    constructor(private readonly runtime: DockerCliRuntime) {
    }

    async startServices(options: {
        services: EnvironmentService[]
        sessionId: string
        workspaceDir: string
    }): Promise<StartedService[]> {
        const started: StartedService[] = []

        for (const service of options.services) {
            const portBindings: DockerCliPortBinding[] = (service.ports ?? []).map((port) => ({
                containerPort: port.containerPort,
                hostPort: port.hostPort,
                protocol: port.protocol ?? 'tcp'
            }))

            const containerName = `haqi-${sanitizeName(options.sessionId)}-${sanitizeName(service.name)}`
            const envEntries = Object.entries(service.env ?? {}).map(([key, value]) => `${key}=${value}`)
            const containerId = await this.runtime.run({
                image: service.image,
                name: containerName,
                command: service.command,
                env: envEntries,
                workingDir: options.workspaceDir,
                mounts: [],
                ports: portBindings,
                labels: {
                    'haqi.session_id': options.sessionId,
                    'haqi.service_name': service.name
                },
                detach: true
            })

            const inspect = await this.runtime.inspect(containerId)
            const previews: PreviewTarget[] = []
            const env: Record<string, string> = {}
            const tempFiles: string[] = []

            for (const port of service.ports ?? []) {
                const hostPort = inspect.portBindings[port.containerPort]
                if (!hostPort) {
                    continue
                }

                env[inferEnvKey(service.name, port.containerPort)] = String(hostPort)
                env[`${inferEnvKey(service.name, port.containerPort)}_URL`] = `http://127.0.0.1:${hostPort}`

                if (port.expose || port.public) {
                    previews.push({
                        id: `${service.name}-${port.containerPort}`,
                        name: port.name ?? `${service.name}:${port.containerPort}`,
                        port: hostPort,
                        url: `http://127.0.0.1:${hostPort}`,
                        visibility: port.public ? 'public' : 'private'
                    })
                }
            }

            if (service.healthcheck?.type === 'command' && service.healthcheck.command?.length) {
                const tempDir = await mkdtemp(join(os.tmpdir(), 'haqi-service-health-'))
                const healthcheckFile = join(tempDir, `${sanitizeName(service.name)}.json`)
                await writeFile(healthcheckFile, JSON.stringify(service.healthcheck, null, 2), 'utf8')
                tempFiles.push(healthcheckFile)
            }

            started.push({
                service,
                containerId,
                env,
                previews,
                tempFiles,
                handle: {
                    id: randomUUID(),
                    name: service.name,
                    image: service.image,
                    containerId,
                    previewTargets: previews,
                    ports: (service.ports ?? []).map((port) => ({
                        containerPort: port.containerPort,
                        hostPort: inspect.portBindings[port.containerPort]
                    }))
                }
            })
        }

        return started
    }

    collectServiceEndpoints(services: StartedService[]): ServiceEndpoint[] {
        const endpoints: ServiceEndpoint[] = []
        for (const service of services) {
            for (const port of service.service.ports ?? []) {
                const hostPort = service.handle.ports?.find((entry) => entry.containerPort === port.containerPort)?.hostPort
                if (!hostPort) {
                    continue
                }
                endpoints.push({
                    service: service.service.name,
                    host: '127.0.0.1',
                    port: hostPort,
                    containerPort: port.containerPort,
                    url: `http://127.0.0.1:${hostPort}`
                })
            }
        }
        return endpoints
    }

    async stopServices(services: StartedService[]): Promise<void> {
        for (const service of services) {
            await this.runtime.stop(service.containerId).catch(() => undefined)
            await this.runtime.remove(service.containerId).catch(() => undefined)
        }
    }
}
