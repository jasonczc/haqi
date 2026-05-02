/**
 * Lightweight port of Claude Code's `isSearchOrReadBashCommand`
 * (~/agent/claude-code/src/tools/BashTool/BashTool.tsx). The CC version uses
 * `shell-quote` for security-grade tokenization; here we only need display
 * classification, so a small homegrown splitter is enough — misclassifying
 * `cat foo.txt` as not-collapsible just degrades the visual grouping, never
 * a correctness or security issue.
 */

const BASH_SEARCH_COMMANDS = new Set([
    'find',
    'grep',
    'rg',
    'ag',
    'ack',
    'locate',
    'which',
    'whereis',
])

const BASH_READ_COMMANDS = new Set([
    'cat',
    'head',
    'tail',
    'less',
    'more',
    'wc',
    'stat',
    'file',
    'strings',
    'jq',
    'awk',
    'cut',
    'sort',
    'uniq',
    'tr',
])

const BASH_LIST_COMMANDS = new Set(['ls', 'tree', 'du', 'pwd'])

const BASH_NEUTRAL_COMMANDS = new Set(['echo', 'printf', 'true', 'false', ':'])

/**
 * `git` is the most common compound command in chat output and lumping it as
 * non-collapsible (its base word `git` isn't in any whitelist) leaves visible
 * stacks of `git status` / `git diff` / `git log` calls that obviously belong
 * together. Whitelist the verbs that are unambiguously read-only — anything
 * else (add / commit / push / reset / checkout) keeps its own row so the user
 * still sees state-changing operations.
 */
const GIT_READ_SUBCOMMANDS = new Set([
    'status',
    'log',
    'diff',
    'show',
    'blame',
    'describe',
    'rev-parse',
    'rev-list',
    'ls-files',
    'ls-tree',
    'ls-remote',
    'shortlog',
    'reflog',
    'cat-file',
    'merge-base',
    'name-rev',
    'whatchanged',
    'symbolic-ref',
    'check-ignore',
    'check-ref-format',
])

const GIT_PRE_SUBCOMMAND_VALUE_FLAGS = new Set(['-C', '--git-dir', '--work-tree'])

function isReadOnlyGitInvocation(segment: string): boolean {
    const tokens = segment.trim().split(/\s+/)
    let i = 0
    // Skip leading env-var assignments (`LANG=C git log`).
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]!)) i++
    if (tokens[i] !== 'git') return false
    i++
    while (i < tokens.length) {
        const t = tokens[i]!
        if (!t.startsWith('-')) break
        // Skip flags that take a value as the next token (`git -C path log`).
        if (GIT_PRE_SUBCOMMAND_VALUE_FLAGS.has(t)) {
            i += 2
            continue
        }
        i++
    }
    const sub = tokens[i]
    if (!sub) return false
    return GIT_READ_SUBCOMMANDS.has(sub)
}

export type BashClassification = {
    isSearch: boolean
    isRead: boolean
    isList: boolean
}

const NOT_COLLAPSIBLE: BashClassification = { isSearch: false, isRead: false, isList: false }

/**
 * Split a bash command line into pipeline segments at top-level operators
 * (|, ||, &&, ;, newline) and drop redirect targets. Quoted strings and
 * backslash escapes are preserved as part of the surrounding segment.
 *
 * Returns just the command segments — the operators themselves are dropped
 * since the classifier only inspects each segment's base command.
 */
export function splitBashSegments(command: string): string[] {
    const segments: string[] = []
    let buf = ''
    let i = 0
    let inSingle = false
    let inDouble = false

    const flush = () => {
        const trimmed = buf.trim()
        if (trimmed.length > 0) segments.push(trimmed)
        buf = ''
    }

    while (i < command.length) {
        const ch = command[i]!
        const next = command[i + 1]
        if (inSingle) {
            buf += ch
            if (ch === "'") inSingle = false
            i++
            continue
        }
        if (inDouble) {
            if (ch === '\\' && next !== undefined) {
                buf += ch + next
                i += 2
                continue
            }
            buf += ch
            if (ch === '"') inDouble = false
            i++
            continue
        }
        if (ch === "'") {
            inSingle = true
            buf += ch
            i++
            continue
        }
        if (ch === '"') {
            inDouble = true
            buf += ch
            i++
            continue
        }
        if (ch === '\\' && next !== undefined) {
            buf += ch + next
            i += 2
            continue
        }
        if ((ch === '|' && next === '|') || (ch === '&' && next === '&')) {
            flush()
            i += 2
            continue
        }
        if (ch === '|' || ch === ';' || ch === '\n') {
            flush()
            i++
            continue
        }
        if (ch === '>') {
            flush()
            i++
            if (command[i] === '>' || command[i] === '&') i++
            while (i < command.length && /\s/.test(command[i]!)) i++
            while (i < command.length && !/\s|[|&;<>\n]/.test(command[i]!)) i++
            continue
        }
        if (ch === '<') {
            flush()
            i++
            while (i < command.length && /\s/.test(command[i]!)) i++
            while (i < command.length && !/\s|[|&;<>\n]/.test(command[i]!)) i++
            continue
        }
        buf += ch
        i++
    }
    flush()
    return segments
}

function extractBaseCommand(segment: string): string | null {
    const trimmed = segment.trim()
    if (!trimmed) return null
    // Skip leading `VAR=val` env assignments — `FOO=1 cat bar` should classify as `cat`.
    let i = 0
    while (i < trimmed.length) {
        const word = trimmed.slice(i).match(/^(\S+)/)
        if (!word) return null
        const w = word[1]!
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
            i += w.length
            while (i < trimmed.length && /\s/.test(trimmed[i]!)) i++
            continue
        }
        return w
    }
    return null
}

/**
 * Classify a bash command line. For pipelines (`a | b`, `a && b`), every
 * non-neutral segment must be a search/read/list command — any other command
 * makes the whole line non-collapsible.
 */
export function classifyBashCommand(command: string): BashClassification {
    const segments = splitBashSegments(command)
    if (segments.length === 0) return NOT_COLLAPSIBLE

    let hasSearch = false
    let hasRead = false
    let hasList = false
    let hasNonNeutral = false

    for (const seg of segments) {
        const base = extractBaseCommand(seg)
        if (!base) continue
        if (BASH_NEUTRAL_COMMANDS.has(base)) continue
        hasNonNeutral = true
        if (base === 'git') {
            if (!isReadOnlyGitInvocation(seg)) return NOT_COLLAPSIBLE
            hasRead = true
            continue
        }
        const isSearch = BASH_SEARCH_COMMANDS.has(base)
        const isRead = BASH_READ_COMMANDS.has(base)
        const isList = BASH_LIST_COMMANDS.has(base)
        if (!isSearch && !isRead && !isList) return NOT_COLLAPSIBLE
        if (isSearch) hasSearch = true
        if (isRead) hasRead = true
        if (isList) hasList = true
    }

    if (!hasNonNeutral) return NOT_COLLAPSIBLE
    return { isSearch: hasSearch, isRead: hasRead, isList: hasList }
}
