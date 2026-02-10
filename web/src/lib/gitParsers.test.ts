import { describe, expect, it } from 'vitest'
import { buildGitStatusFiles } from './gitParsers'

describe('buildGitStatusFiles', () => {
    it('parses legacy single-repo output', () => {
        const statusOutput = [
            '# branch.oid aaaaaaa',
            '# branch.head main',
            '1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa src/app.ts',
            '? new-file.ts'
        ].join('\n')

        const unstagedDiffOutput = '2\t1\tsrc/app.ts'
        const stagedDiffOutput = ''

        const result = buildGitStatusFiles(statusOutput, unstagedDiffOutput, stagedDiffOutput)
        expect(result.branch).toBe('main')
        expect(result.repos).toEqual([])
        expect(result.totalStaged).toBe(0)
        expect(result.totalUnstaged).toBe(2)

        const modified = result.unstagedFiles.find((file) => file.fullPath === 'src/app.ts')
        expect(modified?.repo).toBeUndefined()
        expect(modified?.linesAdded).toBe(2)
        expect(modified?.linesRemoved).toBe(1)

        const untracked = result.unstagedFiles.find((file) => file.fullPath === 'new-file.ts')
        expect(untracked?.status).toBe('untracked')
    })

    it('parses aggregated child-repo output and preserves repo prefixes', () => {
        const statusOutput = [
            '@@HAPI_REPO repo-a',
            '# branch.oid 1111111',
            '# branch.head main',
            '1 .M N... 100644 100644 100644 1111111 1111111 src/a.ts',
            '@@HAPI_REPO_END',
            '@@HAPI_REPO repo-b',
            '# branch.oid 2222222',
            '# branch.head feature',
            '? new-b.ts',
            '@@HAPI_REPO_END'
        ].join('\n')

        const unstagedDiffOutput = [
            '@@HAPI_REPO repo-a',
            '3\t1\tsrc/a.ts',
            '@@HAPI_REPO_END',
            '@@HAPI_REPO repo-b',
            '@@HAPI_REPO_END'
        ].join('\n')

        const stagedDiffOutput = [
            '@@HAPI_REPO repo-a',
            '@@HAPI_REPO_END',
            '@@HAPI_REPO repo-b',
            '@@HAPI_REPO_END'
        ].join('\n')

        const result = buildGitStatusFiles(statusOutput, unstagedDiffOutput, stagedDiffOutput)
        expect(result.branch).toBeNull()
        expect(result.repos).toEqual([
            { name: 'repo-a', branch: 'main' },
            { name: 'repo-b', branch: 'feature' }
        ])

        const repoAFile = result.unstagedFiles.find((file) => file.fullPath === 'repo-a/src/a.ts')
        expect(repoAFile).toBeTruthy()
        expect(repoAFile?.repo).toBe('repo-a')
        expect(repoAFile?.linesAdded).toBe(3)
        expect(repoAFile?.linesRemoved).toBe(1)

        const repoBFile = result.unstagedFiles.find((file) => file.fullPath === 'repo-b/new-b.ts')
        expect(repoBFile).toBeTruthy()
        expect(repoBFile?.repo).toBe('repo-b')
        expect(repoBFile?.status).toBe('untracked')
    })
})
