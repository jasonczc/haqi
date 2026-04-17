/**
 * Declarative filter expression evaluator.
 *
 * The filter lives in the routine as a data structure (see
 * FilterExpressionSchema in @hapi/protocol/schemas). This module is the
 * only place that knows how to turn "this expression" + "this context"
 * into a boolean. Keeping it pure + data-driven means:
 *
 *   - UI can render a visual builder against the same shape.
 *   - We can dry-run the filter against historical payloads.
 *   - New operators = extend one switch statement; nobody else changes.
 *
 * `path` uses dotted notation with array indexing: `pr.labels.0.name`
 * or `pull_request.base.ref`. Missing paths resolve to `undefined` and
 * never throw.
 */

import type { FilterExpression } from '@hapi/protocol/schemas'

export type EvaluateResult = {
    matched: boolean
    /** Human-readable short reason, meant for the "why did this fire?" UI. */
    reason: string
}

export function evaluateFilter(expr: FilterExpression | undefined, context: unknown): EvaluateResult {
    // No filter = always match. Routines without filters fire on every
    // eligible trigger, same as Anthropic's behavior.
    if (!expr) return { matched: true, reason: 'no filter' }
    return evaluateNode(expr, context)
}

function evaluateNode(node: FilterExpression, ctx: unknown): EvaluateResult {
    switch (node.op) {
        case 'and': {
            for (const clause of node.clauses) {
                const res = evaluateNode(clause, ctx)
                if (!res.matched) return { matched: false, reason: `and: ${res.reason}` }
            }
            return { matched: true, reason: `and(${node.clauses.length})` }
        }
        case 'or': {
            const reasons: string[] = []
            for (const clause of node.clauses) {
                const res = evaluateNode(clause, ctx)
                if (res.matched) return { matched: true, reason: `or: ${res.reason}` }
                reasons.push(res.reason)
            }
            return { matched: false, reason: `or: none matched (${reasons.join('; ')})` }
        }
        case 'not': {
            const res = evaluateNode(node.clause, ctx)
            return { matched: !res.matched, reason: `not: ${res.reason}` }
        }
        case 'exists': {
            const value = readPath(ctx, node.path)
            return {
                matched: value !== undefined && value !== null,
                reason: `exists(${node.path}) = ${value !== undefined && value !== null}`
            }
        }
        case 'eq': {
            const value = readPath(ctx, node.path)
            return {
                matched: value === node.value,
                reason: `eq(${node.path}): ${repr(value)} === ${repr(node.value)}`
            }
        }
        case 'ne': {
            const value = readPath(ctx, node.path)
            return {
                matched: value !== node.value,
                reason: `ne(${node.path}): ${repr(value)} !== ${repr(node.value)}`
            }
        }
        case 'includes': {
            const value = readPath(ctx, node.path)
            const needle = String(node.value)
            const matched = asContainer(value, needle)
            return {
                matched,
                reason: `includes(${node.path}, ${repr(needle)}) = ${matched}`
            }
        }
        case 'startsWith': {
            const value = readPath(ctx, node.path)
            const needle = String(node.value)
            const str = typeof value === 'string' ? value : ''
            return {
                matched: typeof value === 'string' && str.startsWith(needle),
                reason: `startsWith(${node.path}, ${repr(needle)}) = ${typeof value === 'string' && str.startsWith(needle)}`
            }
        }
        case 'endsWith': {
            const value = readPath(ctx, node.path)
            const needle = String(node.value)
            const str = typeof value === 'string' ? value : ''
            return {
                matched: typeof value === 'string' && str.endsWith(needle),
                reason: `endsWith(${node.path}, ${repr(needle)}) = ${typeof value === 'string' && str.endsWith(needle)}`
            }
        }
        case 'matches': {
            const value = readPath(ctx, node.path)
            const pattern = String(node.value)
            if (typeof value !== 'string') {
                return { matched: false, reason: `matches(${node.path}): value not a string` }
            }
            try {
                const re = new RegExp(pattern)
                return {
                    matched: re.test(value),
                    reason: `matches(${node.path}, /${pattern}/) = ${re.test(value)}`
                }
            } catch (err) {
                // Bad regex = never match; surface the reason for debugging.
                return { matched: false, reason: `matches(${node.path}): invalid regex ${repr(pattern)}` }
            }
        }
        default: {
            const _exhaustive: never = node
            return { matched: false, reason: 'unknown operator' }
        }
    }
}

/**
 * Dotted-path read. Supports numeric indices: `a.b.0.name` reads
 * `a.b[0].name`. Missing keys/indices return undefined without throwing.
 * Deliberately forgiving so bad filters degrade gracefully instead of
 * blocking fires.
 */
export function readPath(value: unknown, path: string): unknown {
    if (!path) return value
    const segments = path.split('.')
    let current: unknown = value
    for (const segment of segments) {
        if (current === null || current === undefined) return undefined
        if (Array.isArray(current)) {
            const idx = Number(segment)
            if (!Number.isInteger(idx)) return undefined
            current = current[idx]
            continue
        }
        if (typeof current === 'object') {
            current = (current as Record<string, unknown>)[segment]
            continue
        }
        return undefined
    }
    return current
}

/**
 * "container includes value" is defined for:
 *   - string  → substring check
 *   - array   → element equality (string-coerced for convenience, so
 *               `["bug","urgent"]` includes `"urgent"`)
 *   - other   → false
 */
function asContainer(value: unknown, needle: string): boolean {
    if (typeof value === 'string') return value.includes(needle)
    if (Array.isArray(value)) {
        return value.some((item) => {
            if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
                return String(item) === needle
            }
            if (item && typeof item === 'object') {
                // Common GitHub payload shape: labels: [{ name: 'bug' }, ...]
                // Check `.name` and `.slug` against needle for ergonomics.
                const obj = item as Record<string, unknown>
                if (typeof obj.name === 'string' && obj.name === needle) return true
                if (typeof obj.slug === 'string' && obj.slug === needle) return true
            }
            return false
        })
    }
    return false
}

function repr(value: unknown): string {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'string') return JSON.stringify(value)
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try { return JSON.stringify(value) } catch { return '[unserializable]' }
}
