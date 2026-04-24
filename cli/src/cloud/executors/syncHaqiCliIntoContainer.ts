/**
 * Dev-mode hot-sync of the host's haqi CLI source into the workspace container.
 *
 * Why: `haqi-workspace:dev` bakes the compiled `haqi` binary at image build
 * time, so cli/shared source edits don't reach the container until the image
 * is rebuilt (slow, multi-GB). `claude-code` / `codex` are npm-packaged so a
 * `npm install -g @latest` hot-updates them; haqi is a bun-compiled standalone
 * executable with no registry, so we do the equivalent via `docker cp` + a
 * shell wrapper that runs the source through the container's bun.
 *
 * Only runs when the worker is operating from a source checkout (i.e., not a
 * compiled-binary deploy) so we have a readable `cli/src/` to copy from.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DockerCliRuntime } from '@/cloud/docker/dockerCli'
import { projectPath, isBunCompiled } from '@/projectPath'
import { logger } from '@/ui/logger'

export type SyncHaqiCliResult =
    | { synced: true }
    | { synced: false; reason: 'compiled-worker' | 'repo-not-found' | 'error'; error?: string }

export async function syncHaqiCliIntoContainer(
    runtime: DockerCliRuntime,
    containerId: string
): Promise<SyncHaqiCliResult> {
    if (isBunCompiled()) {
        return { synced: false, reason: 'compiled-worker' }
    }

    const cliRoot = projectPath()
    const repoRoot = resolve(cliRoot, '..')
    const cliSrc = resolve(cliRoot, 'src')
    const sharedSrc = resolve(repoRoot, 'shared/src')

    if (!existsSync(cliSrc) || !existsSync(sharedSrc)) {
        return { synced: false, reason: 'repo-not-found' }
    }

    try {
        await runtime.copyToContainer(cliSrc, containerId, '/opt/haqi/cli/src')
        await runtime.copyToContainer(sharedSrc, containerId, '/opt/haqi/shared/src')

        // Replace the baked binary with a shim that runs source through bun.
        // The image already ships bun + /opt/haqi/**/node_modules so no extra
        // install step is needed.
        const wrapper = [
            '#!/bin/sh',
            'exec /usr/local/bun/bin/bun /opt/haqi/cli/src/index.ts "$@"',
            ''
        ].join('\n')
        const b64 = Buffer.from(wrapper).toString('base64')
        await runtime.exec({
            containerId,
            user: 'root',
            command: [
                'sh',
                '-c',
                `echo '${b64}' | base64 -d > /usr/local/bin/haqi && chmod 755 /usr/local/bin/haqi`
            ]
        })
        logger.debug(`[syncHaqiCli] source synced into ${containerId.slice(0, 12)}`)
        return { synced: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`[syncHaqiCli] sync failed, falling back to baked haqi: ${message}`)
        return { synced: false, reason: 'error', error: message }
    }
}
