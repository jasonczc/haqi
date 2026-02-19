import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const THIS_DIR = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(THIS_DIR, '../..')

const TARGET_PATHS: string[] = [
    'README.md',
    'AGENTS.md',
    'cli/README.md',
    'cli/src/runner/README.md',
    'hub/README.md',
    'web/README.md',
    'docs/guide',
    'docs/.vitepress',
    'scripts/hapi-local.sh',
    'cli/src/claude/utils/systemPrompt.ts',
    'cli/src/codex/utils/systemPrompt.ts',
    'cli/src/opencode/utils/systemPrompt.ts',
    'cli/src/commands/runCli.ts',
    'cli/src/utils/autoStartServer.ts',
    'cli/src/ui/doctor.ts',
    'cli/src/ui/tokenInit.ts',
    'web/src/components/LoginPrompt.tsx',
    'web/src/lib/locales/en.ts',
    'web/src/lib/locales/zh-CN.ts',
    'hub/src/index.ts',
    'hub/src/telegram/bot.ts',
    'hub/src/web/server.ts'
]

const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist', '.next', '.turbo'])
const ALLOWED_EXTENSIONS = new Set([
    '.md',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.yml',
    '.yaml',
    '.sh',
    '.txt'
])

type ReplacementRule = {
    description: string
    pattern: RegExp
    replacement: string
}

const BRAND_REPLACEMENT_RULES: ReplacementRule[] = [
    {
        description: 'NPM package scope in docs/examples',
        pattern: /@twsxtd\/hapi\b/g,
        replacement: '@twsxtd/haqi'
    },
    {
        description: 'MCP tool namespace (functions)',
        pattern: /\bfunctions\.hapi__change_title\b/g,
        replacement: 'functions.haqi__change_title'
    },
    {
        description: 'MCP tool namespace (mcp__*)',
        pattern: /\bmcp__hapi__change_title\b/g,
        replacement: 'mcp__haqi__change_title'
    },
    {
        description: 'MCP tool identifier (generic)',
        pattern: /\bhapi__change_title\b/g,
        replacement: 'haqi__change_title'
    },
    {
        description: 'OpenCode MCP tool name',
        pattern: /\bhapi_change_title\b/g,
        replacement: 'haqi_change_title'
    },
    {
        description: 'Hub product name (kebab-case)',
        pattern: /\bhapi-hub\b/g,
        replacement: 'haqi-hub'
    },
    {
        description: 'CLI/app source labels (kebab-case)',
        pattern: /\bhapi-cli\b/g,
        replacement: 'haqi-cli'
    },
    {
        description: 'App source labels (kebab-case)',
        pattern: /\bhapi-app\b/g,
        replacement: 'haqi-app'
    },
    {
        description: 'Command tokens for well-known subcommands',
        pattern: /\bhapi(?=\s+(?:hub|server|auth|runner|doctor|codex|gemini|opencode|mcp|MCP|claude|CLI|Bot)\b)/g,
        replacement: 'haqi'
    },
    {
        description: 'Inline code command token',
        pattern: /`hapi(?=(?:\s|`))/g,
        replacement: '`haqi'
    },
    {
        description: 'Shell-like line starts',
        pattern: /^([ \t]*(?:[$#]\s*)?)hapi(?=\s|$)/gm,
        replacement: '$1haqi'
    },
    {
        description: 'Version output label',
        pattern: /\bhapi(?=\sversion:)/g,
        replacement: 'haqi'
    },
    {
        description: 'Title-case brand in prose',
        pattern: /\bHapi\b/g,
        replacement: 'Haqi'
    },
    {
        description: 'Uppercase brand in prose (not env vars)',
        pattern: /\bHAPI\b(?!_)/g,
        replacement: 'HAQI'
    },
    {
        description: 'Example domain placeholder',
        pattern: /hapi\.example\.com/g,
        replacement: 'haqi.example.com'
    }
]

function shouldIncludeFile(filePath: string): boolean {
    const extension = extname(filePath)
    return ALLOWED_EXTENSIONS.has(extension)
}

async function collectFilesRecursively(directoryPath: string, files: string[]): Promise<void> {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true })

    for (const entry of entries) {
        if (SKIP_DIR_NAMES.has(entry.name)) {
            continue
        }

        const absolutePath = resolve(directoryPath, entry.name)
        if (entry.isDirectory()) {
            await collectFilesRecursively(absolutePath, files)
            continue
        }

        if (entry.isFile() && shouldIncludeFile(absolutePath)) {
            files.push(absolutePath)
        }
    }
}

export async function collectBrandTargetFiles(): Promise<string[]> {
    const files: string[] = []

    for (const targetPath of TARGET_PATHS) {
        const absolutePath = resolve(REPO_ROOT, targetPath)
        if (!existsSync(absolutePath)) {
            continue
        }

        const stat = await fs.stat(absolutePath)
        if (stat.isDirectory()) {
            await collectFilesRecursively(absolutePath, files)
            continue
        }

        if (stat.isFile() && shouldIncludeFile(absolutePath)) {
            files.push(absolutePath)
        }
    }

    files.sort((left, right) => left.localeCompare(right))
    return files
}

export function applyHaqiBrandTransforms(content: string): string {
    let updatedContent = content

    for (const rule of BRAND_REPLACEMENT_RULES) {
        updatedContent = updatedContent.replace(rule.pattern, rule.replacement)
    }

    return updatedContent
}

export function toRelativePath(absolutePath: string): string {
    return relative(REPO_ROOT, absolutePath)
}
