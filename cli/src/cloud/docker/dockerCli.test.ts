import { describe, expect, it } from 'vitest'
import { buildDockerRunArgs } from './dockerCli'

describe('buildDockerRunArgs', () => {
    it('includes CPU and memory limits when provided', () => {
        const args = buildDockerRunArgs({
            image: 'haqi-workspace:dev',
            name: 'test-container',
            cpus: 1,
            memoryMb: 3072,
            detach: true
        })

        expect(args).toEqual(expect.arrayContaining([
            '--cpus',
            '1',
            '--memory',
            '3072m'
        ]))
    })

    it('skips invalid CPU and memory limits', () => {
        const args = buildDockerRunArgs({
            image: 'haqi-workspace:dev',
            cpus: 0,
            memoryMb: -1
        })

        expect(args).not.toContain('--cpus')
        expect(args).not.toContain('--memory')
    })
})
