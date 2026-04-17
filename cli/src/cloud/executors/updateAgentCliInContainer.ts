/**
 * Best-effort pre-spawn update of the agent CLI inside the workspace container.
 *
 * Why: `Dockerfile.workspace` bakes `@anthropic-ai/claude-code` and
 * `@openai/codex` at build time, so any session landing on a stale image
 * (or a checkpoint image even older) runs a stale agent CLI. This helper
 * runs `npm install -g <pkg>@latest` *as root* right before we spawn the
 * agent. On any failure — non-zero exit, timeout, docker exec error — we
 * swallow and fall back to whatever version is already installed. The
 * session never blocks on this.
 *
 * The daemon process itself runs as the non-root container user
 * (`setpriv --reuid ... haqi-daemon`), so it cannot do a global npm
 * install. We go around it with `docker exec -u root`.
 */

import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import { logger } from '@/ui/logger'

/**
 * Map agent flavor → npm package to refresh. Flavors absent from this map
 * are intentionally no-op (e.g., cursor/gemini/opencode aren't baked into
 * Dockerfile.workspace today).
 */
const AGENT_NPM_PACKAGE: Record<string, string> = {
    claude: '@anthropic-ai/claude-code',
    codex: '@openai/codex'
}

const DEFAULT_TIMEOUT_MS = 60_000

export type AgentCliUpdateResult =
    | { updated: true; agent: string; package: string }
    | { updated: false; agent: string; package?: string; reason: 'unsupported' | 'timeout' | 'error'; error?: string }

export async function updateAgentCliInContainer(
    runtime: DockerCliRuntime,
    containerId: string,
    agent: string,
    opts?: { timeoutMs?: number }
): Promise<AgentCliUpdateResult> {
    const pkg = AGENT_NPM_PACKAGE[agent]
    if (!pkg) {
        return { updated: false, agent, reason: 'unsupported' }
    }

    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const script = `npm install -g ${pkg}@latest`

    try {
        await withTimeout(
            runtime.exec({
                containerId,
                user: 'root',
                command: ['sh', '-lc', script]
            }),
            timeoutMs
        )
        logger.debug(`[updateAgentCli] ${pkg}@latest installed in ${containerId.slice(0, 12)}`)
        return { updated: true, agent, package: pkg }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message === '__timeout__') {
            logger.warn(`[updateAgentCli] ${pkg} update timed out after ${timeoutMs}ms; keeping baked-in version`)
            return { updated: false, agent, package: pkg, reason: 'timeout' }
        }
        logger.warn(`[updateAgentCli] ${pkg} update failed; keeping baked-in version: ${message}`)
        return { updated: false, agent, package: pkg, reason: 'error', error: message }
    }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('__timeout__')), ms)
        p.then(
            (v) => { clearTimeout(timer); resolve(v) },
            (e) => { clearTimeout(timer); reject(e) }
        )
    })
}
