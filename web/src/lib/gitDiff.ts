import { createTwoFilesPatch } from 'diff/lib/patch/create.js'
import { langAlias } from '@/lib/shiki'

const SUPPORTED_GIT_DIFF_LANGUAGES = new Set([
    'plaintext',
    'text',
    'shellscript',
    'powershell',
    'json',
    'yaml',
    'toml',
    'xml',
    'ini',
    'markdown',
    'html',
    'css',
    'scss',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'sql',
    'graphql',
    'c',
    'rust',
    'go',
    'java',
    'kotlin',
    'python',
    'php',
    'swift',
    'csharp',
    'dockerfile',
    'makefile',
    'make',
    'diff'
])

const DIFF_LANGUAGE_ALIAS: Record<string, string> = {
    shellscript: 'bash',
    make: 'makefile',
    text: 'plaintext'
}

export function normalizeGitDiffLanguage(language: string | undefined): string {
    if (!language) return 'plaintext'
    const normalized = DIFF_LANGUAGE_ALIAS[language] ?? language
    return SUPPORTED_GIT_DIFF_LANGUAGES.has(normalized) ? normalized : 'plaintext'
}

export function inferGitDiffLanguage(filePath: string | undefined): string {
    if (!filePath) return 'plaintext'

    const normalizedPath = filePath.replace(/\\/g, '/')
    const fileName = normalizedPath.split('/').pop() ?? ''
    const dotIndex = fileName.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
        return 'plaintext'
    }

    const extension = fileName.slice(dotIndex + 1).toLowerCase()
    const language = langAlias[extension] ?? extension
    return normalizeGitDiffLanguage(language)
}

export function parseDiffPathMarker(line: string): string | undefined {
    const markerValue = line.replace(/^(?:\+\+\+|---)\s+/, '')
    const normalized = markerValue.replace(/^[ab]\//, '').trim()
    if (!normalized || normalized === '/dev/null') return undefined
    return normalized
}

export function parseUnifiedDiff(unifiedDiff: string): { oldText: string; newText: string; fileName?: string } {
    const lines = unifiedDiff.split('\n')
    const oldLines: string[] = []
    const newLines: string[] = []
    let fileName: string | undefined
    let inHunk = false

    for (const line of lines) {
        if (line.startsWith('+++ ')) {
            fileName = parseDiffPathMarker(line) ?? fileName
            continue
        }

        if (line.startsWith('--- ')) {
            fileName = fileName ?? parseDiffPathMarker(line)
            continue
        }

        if (
            line.startsWith('diff --git')
            || line.startsWith('index ')
            || line.startsWith('new file mode')
            || line.startsWith('deleted file mode')
            || line.startsWith('similarity index ')
            || line.startsWith('rename from ')
            || line.startsWith('rename to ')
        ) {
            continue
        }

        if (line.startsWith('@@')) {
            inHunk = true
            continue
        }

        if (!inHunk) continue

        if (line.startsWith('+')) {
            newLines.push(line.slice(1))
        } else if (line.startsWith('-')) {
            oldLines.push(line.slice(1))
        } else if (line.startsWith(' ')) {
            oldLines.push(line.slice(1))
            newLines.push(line.slice(1))
        } else if (line === '\\ No newline at end of file') {
            continue
        } else if (line === '') {
            oldLines.push('')
            newLines.push('')
        }
    }

    return {
        oldText: oldLines.join('\n'),
        newText: newLines.join('\n'),
        fileName
    }
}

export function buildSyntheticUnifiedDiff(props: {
    filePath?: string
    oldContent: string
    newContent: string
}): string {
    const filePath = props.filePath?.trim() || 'untitled'
    const oldFileName = `a/${filePath}`
    const newFileName = `b/${filePath}`
    const oldLineCount = props.oldContent === '' ? 0 : props.oldContent.split('\n').length
    const newLineCount = props.newContent === '' ? 0 : props.newContent.split('\n').length
    const context = Math.max(oldLineCount, newLineCount, 3)

    return createTwoFilesPatch(
        oldFileName,
        newFileName,
        props.oldContent,
        props.newContent,
        '',
        '',
        { context }
    )
}
