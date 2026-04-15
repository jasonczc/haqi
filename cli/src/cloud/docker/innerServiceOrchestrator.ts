import { randomUUID } from 'node:crypto'
import type { EnvironmentService, PreviewTarget } from '@hapi/protocol/types'
import type { DockerCliRuntime } from './dockerCli'
import type { ServiceEndpoint, ServiceRuntimeHandle } from '@/cloud/types'

const INNER_DOCKER_RUNTIME_DIR = '/tmp/xdg-runtime-haqi'
const INNER_DOCKER_HOST = `unix://${INNER_DOCKER_RUNTIME_DIR}/docker.sock`

export type StartedInnerService = {
    service: EnvironmentService
    containerId: string
    env: Record<string, string>
    previews: PreviewTarget[]
    endpointPorts: Record<number, number>
    handle: ServiceRuntimeHandle
}

function sanitizeName(input: string): string {
    return input.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'service'
}

function inferEnvKey(serviceName: string, port: number): string {
    return `${sanitizeName(serviceName).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${port}`
}

export class InnerDockerServiceOrchestrator {
    constructor(
        private readonly runtime: DockerCliRuntime,
        private readonly containerId: string,
        private readonly user: string,
        private readonly home: string
    ) {
    }

    private containerEnv(): string[] {
        return [
            `HOME=${this.home}`,
            `USER=${this.user}`,
            `LOGNAME=${this.user}`,
            `XDG_RUNTIME_DIR=${INNER_DOCKER_RUNTIME_DIR}`,
            `DOCKER_HOST=${INNER_DOCKER_HOST}`
        ]
    }

    async startServices(options: {
        services: EnvironmentService[]
        sessionId: string
        workspaceDir: string
    }): Promise<StartedInnerService[]> {
        const started: StartedInnerService[] = []

        await this.runtime.exec({
            containerId: this.containerId,
            user: this.user,
            env: this.containerEnv(),
            command: ['sh', '-lc', 'ids="$(docker ps -aq --filter label=haqi.managed_service=true)"; [ -z "$ids" ] || docker rm -f $ids >/dev/null 2>&1']
        }).catch(() => undefined)

        for (const service of options.services) {
            const containerName = `haqi-${sanitizeName(options.sessionId)}-${sanitizeName(service.name)}`
            const args: string[] = ['docker', 'run', '-d', '--name', containerName]

            if (service.restartPolicy) {
                args.push('--restart', service.restartPolicy)
            }

            for (const [key, value] of Object.entries(service.env ?? {})) {
                args.push('-e', `${key}=${value}`)
            }
            for (const volume of service.volumes ?? []) {
                args.push('-v', volume)
            }

            const env: Record<string, string> = {}
            const endpointPorts: Record<number, number> = {}
            const previews: PreviewTarget[] = []

            for (const port of service.ports ?? []) {
                const publishedPort = port.hostPort ?? port.containerPort
                endpointPorts[port.containerPort] = publishedPort
                args.push('-p', `${publishedPort}:${port.containerPort}/${port.protocol ?? 'tcp'}`)
                env[inferEnvKey(service.name, port.containerPort)] = String(publishedPort)
                env[`${inferEnvKey(service.name, port.containerPort)}_URL`] = `http://127.0.0.1:${publishedPort}`
                if (port.expose || port.public) {
                    previews.push({
                        id: `${service.name}-${port.containerPort}`,
                        name: port.name ?? `${service.name}:${port.containerPort}`,
                        port: publishedPort,
                        url: `http://127.0.0.1:${publishedPort}`,
                        visibility: port.public ? 'public' : 'private'
                    })
                }
            }

            args.push('--label', `haqi.session_id=${options.sessionId}`)
            args.push('--label', `haqi.service_name=${service.name}`)
            args.push('--label', 'haqi.managed_service=true')
            args.push(service.image)
            if (service.command?.length) {
                args.push(...service.command)
            }

            const result = await this.runtime.exec({
                containerId: this.containerId,
                user: this.user,
                workingDir: options.workspaceDir,
                env: this.containerEnv(),
                command: args
            })
            const innerContainerId = result.stdout.trim()

            started.push({
                service,
                containerId: innerContainerId,
                env,
                previews,
                endpointPorts,
                handle: {
                    id: randomUUID(),
                    name: service.name,
                    image: service.image,
                    containerId: innerContainerId,
                    previewTargets: previews,
                    ports: (service.ports ?? []).map((port) => ({
                        containerPort: port.containerPort,
                        hostPort: endpointPorts[port.containerPort]
                    }))
                }
            })
        }

        return started
    }

    collectServiceEndpoints(services: StartedInnerService[]): ServiceEndpoint[] {
        const endpoints: ServiceEndpoint[] = []
        for (const service of services) {
            for (const port of service.service.ports ?? []) {
                const publishedPort = service.endpointPorts[port.containerPort]
                if (!publishedPort) {
                    continue
                }
                endpoints.push({
                    service: service.service.name,
                    host: '127.0.0.1',
                    port: publishedPort,
                    containerPort: port.containerPort,
                    url: `http://127.0.0.1:${publishedPort}`
                })
            }
        }
        return endpoints
    }

    async stopServices(services: StartedInnerService[]): Promise<void> {
        for (const service of services) {
            await this.runtime.exec({
                containerId: this.containerId,
                user: this.user,
                env: this.containerEnv(),
                command: ['docker', 'rm', '-f', service.containerId]
            }).catch(() => undefined)
        }
    }
}
