import { resolve } from 'node:path'
import type {
    EnvironmentEnv,
    EnvironmentEnvFile,
} from '@hapi/protocol/types'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'

function normalizeEnvFile(entry: EnvironmentEnvFile): { path: string; required: boolean } {
    if (typeof entry === 'string') {
        return {
            path: entry,
            required: false
        }
    }
    return {
        path: entry.path,
        required: entry.required === true
    }
}

export function parseDotenvContent(raw: string): Record<string, string> {
    const env: Record<string, string> = {}
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
            continue
        }
        const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
        const separator = normalized.indexOf('=')
        if (separator <= 0) {
            continue
        }
        const key = normalized.slice(0, separator).trim()
        let value = normalized.slice(separator + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
            value = value.slice(1, -1)
        }
        if (!key) {
            continue
        }
        env[key] = value
    }
    return env
}

function resolveEnvFilePath(basePath: string, filePath: string): string {
    return resolve(basePath, filePath)
}

export async function loadBootstrapEnvironmentFiles(params: {
    envConfig: EnvironmentEnv | undefined
    basePath: string
}): Promise<Record<string, string>> {
    const env: Record<string, string> = {}
    if (!params.envConfig?.files?.length) {
        return {
            ...(params.envConfig?.vars ?? {})
        }
    }

    const { readFile } = await import('node:fs/promises')
    for (const entry of params.envConfig.files) {
        const file = normalizeEnvFile(entry)
        const candidate = resolveEnvFilePath(params.basePath, file.path)
        try {
            const raw = await readFile(candidate, 'utf8')
            Object.assign(env, parseDotenvContent(raw))
        } catch (error) {
            if (file.required) {
                const message = error instanceof Error ? error.message : String(error)
                throw new Error(`Required env file missing: ${candidate} (${message})`)
            }
        }
    }
    return {
        ...env,
        ...(params.envConfig.vars ?? {})
    }
}

export async function loadBootstrapEnvironmentFilesInContainer(params: {
    envConfig: EnvironmentEnv | undefined
    runtime: DockerCliRuntime
    containerId: string
    basePath: string
    user?: string
    home?: string
}): Promise<Record<string, string>> {
    const env: Record<string, string> = {}
    if (!params.envConfig?.files?.length) {
        return {
            ...(params.envConfig?.vars ?? {})
        }
    }

    for (const entry of params.envConfig.files) {
        const file = normalizeEnvFile(entry)
        const candidate = resolveEnvFilePath(params.basePath, file.path)
        const result = await params.runtime.exec({
            containerId: params.containerId,
            user: params.user,
            env: [
                ...(params.home ? [`HOME=${params.home}`] : []),
                ...(params.user ? [`USER=${params.user}`, `LOGNAME=${params.user}`] : [])
            ],
            command: ['sh', '-lc', `if [ -f ${JSON.stringify(candidate)} ]; then cat ${JSON.stringify(candidate)}; else exit 42; fi`]
        }).catch(() => null)

        if (!result) {
            if (file.required) {
                throw new Error(`Required env file missing in container: ${candidate}`)
            }
            continue
        }

        Object.assign(env, parseDotenvContent(result.stdout))
    }
    return {
        ...env,
        ...(params.envConfig.vars ?? {})
    }
}
