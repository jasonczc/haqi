import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type DockerCliPortBinding = {
    containerPort: number
    hostPort?: number
    protocol?: 'tcp' | 'udp'
}

export type DockerCommandResult = {
    stdout: string
    stderr: string
}

export async function runDockerCommand(
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<DockerCommandResult> {
    try {
        const result = await execFileAsync('docker', args, {
            cwd: options?.cwd,
            env: options?.env,
        })

        return {
            stdout: result.stdout?.toString() ?? '',
            stderr: result.stderr?.toString() ?? '',
        }
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & {
            stdout?: string | Buffer
            stderr?: string | Buffer
        }
        const stdout = execError.stdout?.toString() ?? ''
        const stderr = execError.stderr?.toString() ?? ''
        const message = stderr.trim() || stdout.trim() || execError.message || 'docker command failed'
        throw new Error(message)
    }
}

export async function ensureDockerAvailable(): Promise<void> {
    await runDockerCommand(['version', '--format', '{{json .}}'])
}

export type DockerRunSpec = {
    image: string
    name?: string
    command?: string[]
    env?: string[]
    workingDir?: string
    mounts?: string[]
    ports?: DockerCliPortBinding[]
    labels?: Record<string, string>
    detach?: boolean
}

export type DockerInspectResult = {
    id: string
    status?: string
    exitCode?: number | null
    portBindings: Record<number, number>
}

export class DockerCliRuntime {
    async ensureAvailable(): Promise<void> {
        await ensureDockerAvailable()
    }

    async pull(image: string): Promise<void> {
        await runDockerCommand(['pull', image])
    }

    async run(spec: DockerRunSpec): Promise<string> {
        const args: string[] = ['run']
        if (spec.detach !== false) {
            args.push('-d')
        }
        if (spec.name) {
            args.push('--name', spec.name)
        }
        if (spec.workingDir) {
            args.push('-w', spec.workingDir)
        }
        for (const env of spec.env ?? []) {
            args.push('-e', env)
        }
        for (const mount of spec.mounts ?? []) {
            args.push('-v', mount)
        }
        for (const port of spec.ports ?? []) {
            const protocol = port.protocol ?? 'tcp'
            const binding = port.hostPort
                ? `${port.hostPort}:${port.containerPort}/${protocol}`
                : `${port.containerPort}/${protocol}`
            args.push('-p', binding)
        }
        for (const [key, value] of Object.entries(spec.labels ?? {})) {
            args.push('--label', `${key}=${value}`)
        }
        args.push(spec.image)
        if (spec.command?.length) {
            args.push(...spec.command)
        }

        const result = await runDockerCommand(args)
        return result.stdout.trim()
    }

    async inspect(containerId: string): Promise<DockerInspectResult> {
        const result = await runDockerCommand(['inspect', containerId])
        const parsed = JSON.parse(result.stdout) as Array<any>
        const entry = parsed[0] ?? {}
        const portsObject = entry?.NetworkSettings?.Ports ?? {}
        const portBindings: Record<number, number> = {}

        for (const [containerPortKey, bindings] of Object.entries(portsObject as Record<string, Array<{ HostPort: string }> | null>)) {
            const containerPort = Number(containerPortKey.split('/')[0])
            const hostPort = bindings?.[0]?.HostPort ? Number(bindings[0].HostPort) : undefined
            if (Number.isFinite(containerPort) && Number.isFinite(hostPort)) {
                portBindings[containerPort] = hostPort as number
            }
        }

        return {
            id: entry?.Id ?? containerId,
            status: entry?.State?.Status,
            exitCode: typeof entry?.State?.ExitCode === 'number' ? entry.State.ExitCode : null,
            portBindings
        }
    }

    async stop(containerId: string): Promise<void> {
        await runDockerCommand(['stop', containerId])
    }

    async remove(containerId: string): Promise<void> {
        await runDockerCommand(['rm', '-f', containerId])
    }
}
