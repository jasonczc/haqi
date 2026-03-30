import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join, resolve } from 'node:path'
import {
    loadWorkspaceEnvironmentTemplate,
    mergeEnvironmentTemplates,
    normalizeEnvironmentTemplatePaths
} from './workspaceEnvironment'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'haqi-env-template-'))
    tempDirs.push(dir)
    return dir
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('workspaceEnvironment', () => {
    it('normalizes relative template paths against the workspace root', () => {
        const basePath = '/tmp/workspace'
        const normalized = normalizeEnvironmentTemplatePaths({
            runtime: {
                buildContext: './docker',
                workingDir: './app'
            },
            workingDir: './repo'
        }, basePath)

        expect(normalized.runtime?.buildContext).toBe(resolve(basePath, 'docker'))
        expect(normalized.runtime?.workingDir).toBe(resolve(basePath, 'app'))
        expect(normalized.workingDir).toBe(resolve(basePath, 'repo'))
    })

    it('merges workspace and explicit templates with explicit values taking precedence', () => {
        const merged = mergeEnvironmentTemplates(
            {
                id: 'repo-env',
                runtime: { kind: 'host-process' },
                install: ['bun install'],
                features: { bun: true, node: true }
            },
            {
                id: 'override-env',
                runtime: { kind: 'docker-session', image: 'ghcr.io/acme/dev:latest' },
                start: ['bun dev'],
                features: { bun: false, python: true }
            }
        )

        expect(merged).toEqual(expect.objectContaining({
            id: 'override-env',
            install: ['bun install'],
            start: ['bun dev'],
            runtime: {
                kind: 'docker-session',
                image: 'ghcr.io/acme/dev:latest'
            },
            features: {
                bun: false,
                node: true,
                python: true
            }
        }))
    })

    it('maps legacy terminals into desktop terminals when desktop config is absent', async () => {
        const root = await makeTempDir()
        await fs.mkdir(join(root, '.haqi'), { recursive: true })
        await fs.writeFile(
            join(root, '.haqi', 'environment.json'),
            JSON.stringify({
                id: 'repo-template',
                runtime: {
                    kind: 'docker-session',
                    image: 'ghcr.io/acme/dev:latest'
                },
                terminals: [
                    {
                        name: 'app',
                        command: 'bun dev'
                    }
                ]
            }),
            'utf8'
        )

        const template = await loadWorkspaceEnvironmentTemplate([root])

        expect(template?.desktop?.terminals).toEqual([
            {
                name: 'app',
                command: 'bun dev'
            }
        ])
    })

    it('loads a workspace template from .haqi/environment.json', async () => {
        const root = await makeTempDir()
        await fs.mkdir(join(root, '.haqi'), { recursive: true })
        await fs.writeFile(
            join(root, '.haqi', 'environment.json'),
            JSON.stringify({
                id: 'repo-template',
                runtime: {
                    kind: 'docker-session',
                    image: 'ghcr.io/acme/dev:latest',
                    buildContext: './docker'
                },
                workingDir: './packages/app'
            }),
            'utf8'
        )

        const template = await loadWorkspaceEnvironmentTemplate([root])

        expect(template).toEqual(expect.objectContaining({
            id: 'repo-template',
            source: 'repo'
        }))
        expect(template?.runtime?.buildContext).toBe(resolve(root, 'docker'))
        expect(template?.workingDir).toBe(resolve(root, 'packages/app'))
    })

    it('falls back to .cursor/environment.json when needed', async () => {
        const root = await makeTempDir()
        await fs.mkdir(join(root, '.cursor'), { recursive: true })
        await fs.writeFile(
            join(root, '.cursor', 'environment.json'),
            JSON.stringify({
                id: 'cursor-template',
                runtime: {
                    kind: 'host-process'
                }
            }),
            'utf8'
        )

        const template = await loadWorkspaceEnvironmentTemplate([root])

        expect(template?.id).toBe('cursor-template')
        expect(template?.source).toBe('repo')
    })
})
