import type { SessionModelMode } from '@/api/types'
import { inferClaudeModelModeFromModel, normalizeClaudeModelValue } from '@hapi/protocol'

// Mirrors cc CLI `--effort` (low/medium/high/xhigh/max). `xhigh` is Opus 4.7-only;
// cc downgrades unsupported levels server-side, so we accept the full set here.
export type ClaudeThinkEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

function normalizeResolvedModel(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }
    const trimmed = value.trim()
    if (!trimmed) {
        return undefined
    }
    const lowered = trimmed.toLowerCase()
    if (lowered === 'default' || lowered === 'auto') {
        return undefined
    }
    return trimmed
}

export function findClaudeModelFromArgs(args: string[] | undefined): string | undefined {
    if (!Array.isArray(args) || args.length === 0) {
        return undefined
    }

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]
        if (typeof arg !== 'string') {
            continue
        }

        const trimmed = arg.trim()
        if (!trimmed) {
            continue
        }

        if (trimmed === '--model' || trimmed === '-m') {
            const next = args[i + 1]
            if (typeof next === 'string' && next.trim()) {
                return next.trim()
            }
            continue
        }

        if (trimmed.startsWith('--model=')) {
            const value = trimmed.slice('--model='.length).trim()
            if (value) {
                return value
            }
            continue
        }

        if (trimmed.startsWith('-m=')) {
            const value = trimmed.slice('-m='.length).trim()
            if (value) {
                return value
            }
        }
    }

    return undefined
}

export function inferClaudeSessionModelMode(model: string | null | undefined): SessionModelMode {
    return inferClaudeModelModeFromModel(model)
}

export function resolveClaudeSessionModelMode(opts: {
    model?: string
    claudeArgs?: string[]
}): SessionModelMode {
    return inferClaudeSessionModelMode(opts.model ?? findClaudeModelFromArgs(opts.claudeArgs))
}

export function resolveClaudeModelSelection(opts: {
    model?: string
    claudeArgs?: string[]
}): {
    model: string | undefined
    mode: SessionModelMode
} {
    const rawModel = normalizeResolvedModel(opts.model ?? findClaudeModelFromArgs(opts.claudeArgs))
    const resolvedModel = rawModel ? (normalizeClaudeModelValue(rawModel) ?? rawModel) : undefined
    return {
        model: resolvedModel,
        mode: inferClaudeSessionModelMode(resolvedModel)
    }
}

export function findClaudeThinkEffortFromArgs(args: string[] | undefined): ClaudeThinkEffort | undefined {
    if (!Array.isArray(args) || args.length === 0) {
        return undefined
    }

    const normalize = (value: string | undefined): ClaudeThinkEffort | undefined => {
        if (!value) {
            return undefined
        }
        const normalized = value.trim().toLowerCase()
        if (
            normalized === 'low'
            || normalized === 'medium'
            || normalized === 'high'
            || normalized === 'xhigh'
            || normalized === 'max'
        ) {
            return normalized
        }
        return undefined
    }

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]
        if (typeof arg !== 'string') {
            continue
        }

        const trimmed = arg.trim()
        if (!trimmed) {
            continue
        }

        if (trimmed === '--effort') {
            const effort = normalize(args[i + 1])
            if (effort) {
                return effort
            }
            continue
        }

        if (trimmed.startsWith('--effort=')) {
            const effort = normalize(trimmed.slice('--effort='.length))
            if (effort) {
                return effort
            }
        }
    }

    return undefined
}
