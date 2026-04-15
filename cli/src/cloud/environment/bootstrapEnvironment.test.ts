import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    loadBootstrapEnvironmentFiles,
    parseDotenvContent
} from './bootstrapEnvironment'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'haqi-bootstrap-env-'))
    tempDirs.push(dir)
    return dir
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('bootstrapEnvironment', () => {
    it('parses dotenv content with comments and export prefixes', () => {
        expect(parseDotenvContent(`
# comment
export FOO=bar
BAR="baz"
EMPTY=
`)).toEqual({
            FOO: 'bar',
            BAR: 'baz',
            EMPTY: ''
        })
    })

    it('loads env files and lets explicit vars override file values', async () => {
        const root = await makeTempDir()
        await fs.writeFile(join(root, '.env.local'), 'API_URL=https://file.example.com\nTOKEN=file-token\n', 'utf8')

        const env = await loadBootstrapEnvironmentFiles({
            basePath: root,
            envConfig: {
                files: ['.env.local'],
                vars: {
                    TOKEN: 'explicit-token'
                }
            }
        })

        expect(env).toEqual({
            API_URL: 'https://file.example.com',
            TOKEN: 'explicit-token'
        })
    })

    it('throws when a required env file is missing', async () => {
        const root = await makeTempDir()

        await expect(loadBootstrapEnvironmentFiles({
            basePath: root,
            envConfig: {
                files: [{ path: '.env.required', required: true }]
            }
        })).rejects.toThrow(/Required env file missing/)
    })
})
