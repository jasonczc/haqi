import type { ReactNode } from 'react'
import type { SessionMetadataSummary } from '@/types/api'
import { isObject } from '@hapi/protocol'
import { BulbIcon, ClipboardIcon, EyeIcon, FileDiffIcon, GlobeIcon, MessageSquareIcon, PuzzleIcon, QuestionIcon, RocketIcon, SearchIcon, TerminalIcon, UsersIcon, WrenchIcon } from '@/components/ToolCard/icons'
import type { ChecklistItem } from '@/components/ToolCard/checklist'
import { extractTodoChecklist, extractUpdatePlanChecklist } from '@/components/ToolCard/checklist'
import { basename, resolveDisplayPath } from '@/utils/path'
import { getInputStringAny, truncate } from '@/lib/toolInputUtils'

const DEFAULT_ICON_CLASS = 'h-3.5 w-3.5'
// Tool presentation registry for `hapi/web` (aligned with `hapi-app`).

export type ToolPresentation = {
    icon: ReactNode
    title: string
    subtitle: string | null
    minimal: boolean
}

function countLines(text: string): number {
    return text.split('\n').length
}

function formatChecklistCount(items: ChecklistItem[], noun: string): string | null {
    if (items.length === 0) return null
    return `${items.length} ${noun}${items.length === 1 ? '' : 's'}`
}

function snakeToTitleWithSpaces(value: string): string {
    return value
        .split('_')
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ')
}

function formatMCPTitle(toolName: string): string {
    const withoutPrefix = toolName.replace(/^mcp__/, '')
    const parts = withoutPrefix.split('__')
    if (parts.length >= 2) {
        const serverName = snakeToTitleWithSpaces(parts[0])
        const toolPart = snakeToTitleWithSpaces(parts.slice(1).join('_'))
        return `MCP: ${serverName} ${toolPart}`
    }
    return `MCP: ${snakeToTitleWithSpaces(withoutPrefix)}`
}

function getRecord(value: unknown): Record<string, unknown> | null {
    return isObject(value) ? value : null
}

function getStringFromRecord(record: Record<string, unknown> | null, keys: string[]): string | null {
    if (!record) return null
    for (const key of keys) {
        const value = record[key]
        if (typeof value === 'string' && value.trim().length > 0) {
            return value
        }
    }
    return null
}

function getWebSearchQueryFromPayload(value: unknown): string | null {
    const record = getRecord(value)
    if (!record) return null

    const direct = getStringFromRecord(record, ['query', 'url'])
    if (direct) return direct

    const action = getRecord(record.action)
    if (!action) return null

    const fromAction = getStringFromRecord(action, ['query', 'url', 'pageUrl', 'page_url', 'pattern'])
    if (fromAction) return fromAction

    if (Array.isArray(action.queries)) {
        const first = action.queries.find((part) => typeof part === 'string' && part.length > 0)
        if (typeof first === 'string') return first
    }

    return null
}

function getMcpSubtitle(input: unknown, result: unknown): string | null {
    const inputRecord = getRecord(input)
    const argsRecord = getRecord(inputRecord?.arguments)

    const fromInput = getStringFromRecord(inputRecord, ['query', 'url', 'path', 'file', 'command', 'cmd', 'message'])
        ?? getStringFromRecord(argsRecord, ['query', 'url', 'path', 'file', 'command', 'cmd', 'message', 'title', 'pattern'])
    if (fromInput) {
        return truncate(fromInput, 100)
    }

    const fromResult = getWebSearchQueryFromPayload(result)
        ?? getStringFromRecord(getRecord(result), ['message', 'error', 'status'])
        ?? getStringFromRecord(getRecord(getRecord(result)?.result), ['message', 'error', 'status'])
    if (fromResult) {
        return truncate(fromResult, 100)
    }

    const tool = getStringFromRecord(inputRecord, ['tool'])
    const status = getStringFromRecord(inputRecord, ['status'])
    if (tool && status) return `${tool} · ${status}`
    return tool ?? status ?? null
}

function isCollabPayload(value: unknown): boolean {
    if (!isObject(value)) return false
    if (typeof value.sender_thread_id === 'string') return true
    if (Array.isArray(value.receiver_thread_ids)) return true
    if (isObject(value.agents_states)) return true
    return false
}

function getCollabSubtitle(input: unknown, result: unknown): string | null {
    const inputRecord = isObject(input) ? input : null
    const resultRecord = isObject(result) ? result : null
    const payload = resultRecord ?? inputRecord
    if (!payload) return null

    const prompt = getInputStringAny(payload, ['prompt'])
    if (prompt) return truncate(prompt, 100)

    const receivers = Array.isArray(payload.receiver_thread_ids)
        ? payload.receiver_thread_ids.filter((value): value is string => typeof value === 'string')
        : []
    if (receivers.length > 0) {
        return receivers.length === 1 ? `1 subagent` : `${receivers.length} subagents`
    }

    const status = getInputStringAny(payload, ['status'])
    return status ?? null
}

type ToolOpts = {
    toolName: string
    input: unknown
    result: unknown
    childrenCount: number
    description: string | null
    metadata: SessionMetadataSummary | null
}

export const knownTools: Record<string, {
    icon: (opts: ToolOpts) => ReactNode
    title: (opts: ToolOpts) => string
    subtitle?: (opts: ToolOpts) => string | null
    minimal?: boolean | ((opts: ToolOpts) => boolean)
}> = {
    Task: {
        icon: () => <RocketIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const name = getInputStringAny(opts.input, ['name'])
            const teamName = getInputStringAny(opts.input, ['team_name'])
            if (name && teamName) return `Agent: ${name}`
            const description = getInputStringAny(opts.input, ['description'])
            return description ?? 'Task'
        },
        subtitle: (opts) => {
            const prompt = getInputStringAny(opts.input, ['prompt'])
            return prompt ? truncate(prompt, 120) : null
        },
        minimal: (opts) => opts.childrenCount === 0
    },
    TeamCreate: {
        icon: () => <UsersIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const teamName = getInputStringAny(opts.input, ['team_name'])
            return teamName ? `Team: ${teamName}` : 'Create Team'
        },
        subtitle: (opts) => getInputStringAny(opts.input, ['description']) ?? null,
        minimal: false
    },
    TeamDelete: {
        icon: () => <UsersIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Delete Team',
        minimal: true
    },
    SendMessage: {
        icon: () => <MessageSquareIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const recipient = getInputStringAny(opts.input, ['recipient'])
            const msgType = getInputStringAny(opts.input, ['type'])
            if (msgType === 'broadcast') return 'Broadcast'
            if (msgType === 'shutdown_request') return `Shutdown: ${recipient ?? 'agent'}`
            if (msgType === 'shutdown_response') return 'Shutdown Response'
            return recipient ? `Message: ${recipient}` : 'Send Message'
        },
        subtitle: (opts) => {
            const summary = getInputStringAny(opts.input, ['summary'])
            return summary ? truncate(summary, 120) : null
        },
        minimal: true
    },
    Bash: {
        icon: () => <TerminalIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => opts.description ?? 'Terminal',
        subtitle: (opts) => getInputStringAny(opts.input, ['command', 'cmd']),
        minimal: true
    },
    Glob: {
        icon: () => <SearchIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => getInputStringAny(opts.input, ['pattern']) ?? 'Search files',
        minimal: true
    },
    Grep: {
        icon: () => <EyeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const pattern = getInputStringAny(opts.input, ['pattern'])
            return pattern ? `grep(pattern: ${pattern})` : 'Search content'
        },
        minimal: true
    },
    LS: {
        icon: () => <SearchIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const path = getInputStringAny(opts.input, ['path'])
            return path ? resolveDisplayPath(path, opts.metadata) : 'List files'
        },
        minimal: true
    },
    CodexBash: {
        icon: (opts) => {
            if (isObject(opts.input) && Array.isArray(opts.input.parsed_cmd) && opts.input.parsed_cmd.length > 0) {
                const first = opts.input.parsed_cmd[0]
                const type = isObject(first) ? first.type : null
                if (type === 'read') return <EyeIcon className={DEFAULT_ICON_CLASS} />
                if (type === 'write') return <FileDiffIcon className={DEFAULT_ICON_CLASS} />
            }
            return <TerminalIcon className={DEFAULT_ICON_CLASS} />
        },
        title: (opts) => {
            if (isObject(opts.input) && Array.isArray(opts.input.parsed_cmd) && opts.input.parsed_cmd.length === 1) {
                const parsed = opts.input.parsed_cmd[0]
                if (isObject(parsed) && parsed.type === 'read' && typeof parsed.name === 'string') {
                    return resolveDisplayPath(parsed.name, opts.metadata)
                }
            }
            return opts.description ?? 'Terminal'
        },
        subtitle: (opts) => {
            const command = getInputStringAny(opts.input, ['command', 'cmd'])
            if (command) return command
            if (isObject(opts.input) && Array.isArray(opts.input.command)) {
                return opts.input.command.filter((part) => typeof part === 'string').join(' ')
            }
            return null
        },
        minimal: true
    },
    CodexPermission: {
        icon: () => <QuestionIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const tool = getInputStringAny(opts.input, ['tool'])
            return tool ? `Permission: ${tool}` : 'Permission request'
        },
        subtitle: (opts) => getInputStringAny(opts.input, ['message', 'command']) ?? null,
        minimal: true
    },
    shell_command: {
        icon: () => <TerminalIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => opts.description ?? 'Terminal',
        subtitle: (opts) => getInputStringAny(opts.input, ['command', 'cmd']),
        minimal: true
    },
    Read: {
        icon: () => <EyeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path', 'file'])
            return file ? resolveDisplayPath(file, opts.metadata) : 'Read file'
        },
        minimal: true
    },
    Edit: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path'])
            return file ? resolveDisplayPath(file, opts.metadata) : 'Edit file'
        },
        minimal: true
    },
    MultiEdit: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path'])
            if (!file) return 'Edit file'
            const edits = isObject(opts.input) && Array.isArray(opts.input.edits) ? opts.input.edits : null
            const count = edits ? edits.length : 0
            const path = resolveDisplayPath(file, opts.metadata)
            return count > 1 ? `${path} (${count} edits)` : path
        },
        minimal: true
    },
    Write: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path'])
            return file ? resolveDisplayPath(file, opts.metadata) : 'Write file'
        },
        subtitle: (opts) => {
            const content = getInputStringAny(opts.input, ['content', 'text'])
            if (!content) return null
            const lines = countLines(content)
            return lines > 1 ? `${lines} lines` : `${content.length} chars`
        },
        minimal: true
    },
    WebFetch: {
        icon: () => <GlobeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const url = getInputStringAny(opts.input, ['url'])
            if (!url) return 'Web fetch'
            try {
                return new URL(url).hostname
            } catch {
                return url
            }
        },
        subtitle: (opts) => {
            const url = getInputStringAny(opts.input, ['url'])
            if (!url) return null
            return url
        },
        minimal: true
    },
    WebSearch: {
        icon: () => <GlobeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => getWebSearchQueryFromPayload(opts.input)
            ?? getWebSearchQueryFromPayload(opts.result)
            ?? 'Web search',
        subtitle: (opts) => {
            const query = getWebSearchQueryFromPayload(opts.input)
                ?? getWebSearchQueryFromPayload(opts.result)
            return query ? truncate(query, 80) : null
        },
        minimal: (opts) => opts.result == null
    },
    ImageView: {
        icon: () => <EyeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const path = getInputStringAny(opts.input, ['path', 'file_path', 'filePath'])
                ?? getInputStringAny(opts.result, ['path', 'file_path', 'filePath'])
            if (!path) return 'Image preview'
            const display = resolveDisplayPath(path, opts.metadata)
            return basename(display)
        },
        subtitle: (opts) => {
            const path = getInputStringAny(opts.input, ['path', 'file_path', 'filePath'])
                ?? getInputStringAny(opts.result, ['path', 'file_path', 'filePath'])
            return path ? resolveDisplayPath(path, opts.metadata) : null
        },
        minimal: false
    },
    NotebookRead: {
        icon: () => <EyeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const path = getInputStringAny(opts.input, ['notebook_path'])
            return path ? resolveDisplayPath(path, opts.metadata) : 'Read notebook'
        },
        minimal: true
    },
    NotebookEdit: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const path = getInputStringAny(opts.input, ['notebook_path'])
            return path ? resolveDisplayPath(path, opts.metadata) : 'Edit notebook'
        },
        subtitle: (opts) => {
            const mode = getInputStringAny(opts.input, ['edit_mode'])
            return mode ? `mode: ${mode}` : null
        },
        minimal: false
    },
    TodoWrite: {
        icon: () => <BulbIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Todo list',
        subtitle: (opts) => formatChecklistCount(extractTodoChecklist(opts.input, opts.result), 'item'),
        minimal: (opts) => extractTodoChecklist(opts.input, opts.result).length === 0
    },
    update_plan: {
        icon: () => <ClipboardIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Plan',
        subtitle: (opts) => formatChecklistCount(extractUpdatePlanChecklist(opts.input, opts.result), 'step'),
        minimal: (opts) => extractUpdatePlanChecklist(opts.input, opts.result).length === 0
    },
    CodexReasoning: {
        icon: () => <BulbIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => getInputStringAny(opts.input, ['title']) ?? 'Reasoning',
        subtitle: (opts) => {
            const content = getInputStringAny(opts.result, ['content'])
            return content ? truncate(content, 120) : null
        },
        minimal: true
    },
    CodexPatch: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Apply changes',
        subtitle: (opts) => {
            if (isObject(opts.input) && isObject(opts.input.changes)) {
                const files = Object.keys(opts.input.changes)
                if (files.length === 0) return null
                const first = files[0]
                const display = resolveDisplayPath(first, opts.metadata)
                const name = basename(display)
                return files.length > 1 ? `${name} (+${files.length - 1})` : name
            }
            return null
        },
        minimal: true
    },
    CodexDiff: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Diff',
        subtitle: (opts) => {
            const unified = getInputStringAny(opts.input, ['unified_diff'])
            if (!unified) return null
            const lines = unified.split('\n')
            for (const line of lines) {
                if (line.startsWith('+++ b/') || line.startsWith('+++ ')) {
                    const fileName = line.replace(/^\+\+\+ (b\/)?/, '')
                    return fileName.split('/').pop() ?? fileName
                }
            }
            return null
        },
        minimal: (opts) => {
            const unified = getInputStringAny(opts.input, ['unified_diff'])
            if (!unified) return true
            return unified.length >= 2000 || countLines(unified) >= 50
        }
    },
    CodexTurnChanges: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Turn changes',
        subtitle: (opts) => {
            if (!isObject(opts.input) || !Array.isArray(opts.input.files)) return null
            const files = opts.input.files.filter((file): file is Record<string, unknown> => isObject(file))
            const count = files.length
            if (count <= 0) return 'No code change in this turn'
            if (count === 1) {
                const first = files[0]
                const path = typeof first.path === 'string' ? first.path : null
                if (!path) return '1 file'
                const display = resolveDisplayPath(path, opts.metadata)
                return basename(display)
            }
            return `${count} files`
        },
        minimal: true
    },
    ExitPlanMode: {
        icon: () => <ClipboardIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Plan proposal',
        minimal: false
    },
    exit_plan_mode: {
        icon: () => <ClipboardIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Plan proposal',
        minimal: false
    },
    AskUserQuestion: {
        icon: () => <QuestionIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const questions = isObject(opts.input) && Array.isArray(opts.input.questions)
                ? opts.input.questions : []
            const count = questions.length
            const first = questions[0] ?? null
            const header = isObject(first) && typeof first.header === 'string'
                ? first.header.trim() : ''

            if (count > 1) {
                return `${count} Questions`
            }
            return header.length > 0 ? header : 'Question'
        },
        subtitle: (opts) => {
            const questions = isObject(opts.input) && Array.isArray(opts.input.questions)
                ? opts.input.questions : []
            const count = questions.length
            const first = questions[0] ?? null
            const question = isObject(first) && typeof first.question === 'string'
                ? first.question.trim() : ''

            if (count > 1 && question.length > 0) {
                return truncate(question, 100) + ` (+${count - 1} more)`
            }
            return question.length > 0 ? truncate(question, 120) : null
        },
        minimal: true
    },
    ask_user_question: {
        icon: () => <QuestionIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const questions = isObject(opts.input) && Array.isArray(opts.input.questions)
                ? opts.input.questions : []
            const count = questions.length
            const first = questions[0] ?? null
            const header = isObject(first) && typeof first.header === 'string'
                ? first.header.trim() : ''

            if (count > 1) {
                return `${count} Questions`
            }
            return header.length > 0 ? header : 'Question'
        },
        subtitle: (opts) => {
            const questions = isObject(opts.input) && Array.isArray(opts.input.questions)
                ? opts.input.questions : []
            const count = questions.length
            const first = questions[0] ?? null
            const question = isObject(first) && typeof first.question === 'string'
                ? first.question.trim() : ''

            if (count > 1 && question.length > 0) {
                return truncate(question, 100) + ` (+${count - 1} more)`
            }
            return question.length > 0 ? truncate(question, 120) : null
        },
        minimal: true
    },
    request_user_input: {
        icon: () => <QuestionIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const questions = isObject(opts.input) && Array.isArray(opts.input.questions)
                ? opts.input.questions : []
            const count = questions.length
            const first = questions[0] ?? null
            const id = isObject(first) && typeof first.id === 'string'
                ? first.id.trim() : ''

            if (count > 1) {
                return `${count} Questions`
            }
            return id.length > 0 ? id : 'Question'
        },
        subtitle: (opts) => {
            const questions = isObject(opts.input) && Array.isArray(opts.input.questions)
                ? opts.input.questions : []
            const count = questions.length
            const first = questions[0] ?? null
            const question = isObject(first) && typeof first.question === 'string'
                ? first.question.trim() : ''

            if (count > 1 && question.length > 0) {
                return truncate(question, 100) + ` (+${count - 1} more)`
            }
            return question.length > 0 ? truncate(question, 120) : null
        },
        minimal: true
    }
}

export function getToolPresentation(opts: Omit<ToolOpts, 'metadata'> & { metadata: SessionMetadataSummary | null }): ToolPresentation {
    if (opts.toolName.startsWith('mcp__')) {
        const subtitle = getMcpSubtitle(opts.input, opts.result)
        const isWebTool = /^mcp__web__/i.test(opts.toolName)
        return {
            icon: <PuzzleIcon className={DEFAULT_ICON_CLASS} />,
            title: formatMCPTitle(opts.toolName),
            subtitle,
            minimal: !isWebTool
        }
    }

    const known = knownTools[opts.toolName]
    if (known) {
        const minimal = typeof known.minimal === 'function' ? known.minimal(opts) : (known.minimal ?? false)
        return {
            icon: known.icon(opts),
            title: known.title(opts),
            subtitle: known.subtitle ? known.subtitle(opts) : null,
            minimal
        }
    }

    const filePath = getInputStringAny(opts.input, ['file_path', 'path', 'filePath', 'file'])
    const command = getInputStringAny(opts.input, ['command', 'cmd'])
    const pattern = getInputStringAny(opts.input, ['pattern'])
    const url = getInputStringAny(opts.input, ['url'])
    const query = getInputStringAny(opts.input, ['query'])

    const subtitle = filePath ?? command ?? pattern ?? url ?? query

    if (isCollabPayload(opts.input) || isCollabPayload(opts.result)) {
        return {
            icon: <RocketIcon className={DEFAULT_ICON_CLASS} />,
            title: 'Subagent coordination',
            subtitle: getCollabSubtitle(opts.input, opts.result),
            minimal: false
        }
    }

    return {
        icon: <WrenchIcon className={DEFAULT_ICON_CLASS} />,
        title: opts.toolName,
        subtitle: subtitle ? truncate(subtitle, 80) : null,
        minimal: true
    }
}
