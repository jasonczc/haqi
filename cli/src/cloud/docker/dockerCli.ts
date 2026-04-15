import { execFile, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { projectPath } from '@/projectPath'

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

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath)
        return true
    } catch {
        return false
    }
}

async function resolveWorkspaceBuildContext(): Promise<string | null> {
    const candidates = [
        path.resolve(projectPath(), '..'),
        path.resolve(process.cwd(), '..'),
        process.cwd()
    ]

    for (const candidate of [...new Set(candidates)]) {
        if (await pathExists(path.join(candidate, 'Dockerfile.workspace'))) {
            return candidate
        }
    }

    return null
}

async function maybeBuildDefaultWorkspaceImage(image: string): Promise<boolean> {
    if (image !== 'haqi-workspace:dev') {
        return false
    }

    const buildContext = await resolveWorkspaceBuildContext()
    if (!buildContext) {
        return false
    }

    await runDockerCommand(['build', '-t', image, '-f', 'Dockerfile.workspace', '.'], {
        cwd: buildContext
    })
    return true
}

export type DockerRunSpec = {
    image: string
    name?: string
    command?: string[]
    entrypoint?: string
    user?: string
    privileged?: boolean
    init?: boolean
    ipc?: string
    shmSize?: string
    securityOpt?: string[]
    capAdd?: string[]
    devices?: string[]
    groupAdd?: string[]
    env?: string[]
    extraHosts?: string[]
    workingDir?: string
    mounts?: string[]
    ports?: DockerCliPortBinding[]
    labels?: Record<string, string>
    detach?: boolean
}

type DockerExecSpec = {
    containerId: string
    command: string[]
    user?: string
    workingDir?: string
    env?: string[]
    detach?: boolean
}

export type DockerInspectResult = {
    id: string
    status?: string
    exitCode?: number | null
    configuredUser?: string
    portBindings: Record<number, number>
}

export class DockerCliRuntime {
    async ensureAvailable(): Promise<void> {
        await ensureDockerAvailable()
    }

    async pull(image: string): Promise<void> {
        try {
            await runDockerCommand(['pull', image])
        } catch {
            // Pull failed — check if image exists locally (e.g., locally built images)
            try {
                await runDockerCommand(['inspect', '--type=image', image])
            } catch {
                try {
                    const built = await maybeBuildDefaultWorkspaceImage(image)
                    if (built) {
                        return
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    throw new Error(`Image ${image} not found locally or in registry; automatic local build failed: ${message}`)
                }
                throw new Error(`Image ${image} not found locally or in registry`)
            }
        }
    }

    async run(spec: DockerRunSpec): Promise<string> {
        const args: string[] = ['run']
        if (spec.detach !== false) {
            args.push('-d')
        }
        if (spec.name) {
            args.push('--name', spec.name)
        }
        if (spec.user) {
            args.push('--user', spec.user)
        }
        if (spec.privileged) {
            args.push('--privileged')
        }
        if (spec.init) {
            args.push('--init')
        }
        if (spec.ipc) {
            args.push('--ipc', spec.ipc)
        }
        if (spec.shmSize) {
            args.push('--shm-size', spec.shmSize)
        }
        for (const securityOpt of spec.securityOpt ?? []) {
            args.push('--security-opt', securityOpt)
        }
        for (const capability of spec.capAdd ?? []) {
            args.push('--cap-add', capability)
        }
        for (const device of spec.devices ?? []) {
            args.push('--device', device)
        }
        for (const group of spec.groupAdd ?? []) {
            args.push('--group-add', group)
        }
        if (spec.workingDir) {
            args.push('-w', spec.workingDir)
        }
        for (const env of spec.env ?? []) {
            args.push('-e', env)
        }
        for (const extraHost of spec.extraHosts ?? []) {
            args.push('--add-host', extraHost)
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
        if (spec.entrypoint) {
            args.push('--entrypoint', spec.entrypoint)
        }
        args.push(spec.image)
        if (spec.command?.length) {
            args.push(...spec.command)
        }

        const result = await runDockerCommand(args)
        return result.stdout.trim()
    }

    async exec(spec: DockerExecSpec): Promise<DockerCommandResult> {
        const args: string[] = ['exec']
        if (spec.detach) {
            args.push('-d')
        }
        if (spec.user) {
            args.push('-u', spec.user)
        }
        if (spec.workingDir) {
            args.push('-w', spec.workingDir)
        }
        for (const env of spec.env ?? []) {
            args.push('-e', env)
        }
        args.push(spec.containerId, ...spec.command)
        return await runDockerCommand(args)
    }

    spawnExec(spec: DockerExecSpec, options?: {
        stdio?: ('pipe' | 'ignore' | 'inherit')[] | ['pipe', 'pipe', 'pipe'] | ['ignore', 'pipe', 'pipe']
        detached?: boolean
    }): ChildProcess {
        const args: string[] = ['exec', '-i']
        if (spec.user) {
            args.push('-u', spec.user)
        }
        if (spec.workingDir) {
            args.push('-w', spec.workingDir)
        }
        for (const env of spec.env ?? []) {
            args.push('-e', env)
        }
        args.push(spec.containerId, ...spec.command)
        return spawn('docker', args, {
            detached: options?.detached,
            stdio: options?.stdio ?? ['ignore', 'pipe', 'pipe']
        })
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
            configuredUser: typeof entry?.Config?.User === 'string' ? entry.Config.User : undefined,
            portBindings
        }
    }

    async findContainerByLabel(label: string, value: string): Promise<string | null> {
        try {
            const result = await runDockerCommand([
                'ps', '-q', '--filter', `label=${label}=${value}`, '--filter', 'status=running'
            ])
            const id = result.stdout.trim().split('\n')[0]
            return id || null
        } catch {
            return null
        }
    }

    async logs(containerId: string, tail: number = 200): Promise<string> {
        const result = await runDockerCommand(['logs', '--tail', String(tail), containerId])
        return [result.stdout, result.stderr].filter(Boolean).join('\n')
    }

    async stop(containerId: string): Promise<void> {
        await runDockerCommand(['stop', containerId])
    }

    async remove(containerId: string): Promise<void> {
        await runDockerCommand(['rm', '-f', containerId])
    }

    async removeVolume(volumeName: string): Promise<void> {
        await runDockerCommand(['volume', 'rm', '-f', volumeName])
    }
}
