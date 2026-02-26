import { describe, expect, it } from 'vitest'
import {
    findClaudeThinkEffortFromArgs,
    findClaudeModelFromArgs,
    inferClaudeSessionModelMode,
    resolveClaudeModelSelection,
    resolveClaudeSessionModelMode
} from './modelMode'

describe('claude model mode detection', () => {
    it('maps explicit aliases', () => {
        expect(inferClaudeSessionModelMode('haiku')).toBe('haiku')
        expect(inferClaudeSessionModelMode('sonnet')).toBe('sonnet')
        expect(inferClaudeSessionModelMode('opus')).toBe('opus')
        expect(inferClaudeSessionModelMode('default')).toBe('default')
    })

    it('maps full Claude model names', () => {
        expect(inferClaudeSessionModelMode('claude-haiku-3-5-20241022')).toBe('haiku')
        expect(inferClaudeSessionModelMode('claude-sonnet-4-20250514')).toBe('sonnet')
        expect(inferClaudeSessionModelMode('claude-opus-4-1')).toBe('opus')
        expect(inferClaudeSessionModelMode(' CLAUDE-OPUS-4 ')).toBe('opus')
    })

    it('returns default for unknown names', () => {
        expect(inferClaudeSessionModelMode('claude-unknown-9')).toBe('default')
        expect(inferClaudeSessionModelMode(undefined)).toBe('default')
    })

    it('extracts model from claude args', () => {
        expect(findClaudeModelFromArgs(['--model', 'claude-opus-4'])).toBe('claude-opus-4')
        expect(findClaudeModelFromArgs(['--foo', 'x', '--model=claude-sonnet-4'])).toBe('claude-sonnet-4')
        expect(findClaudeModelFromArgs(['-m', 'opus'])).toBe('opus')
        expect(findClaudeModelFromArgs(['-m=sonnet'])).toBe('sonnet')
    })

    it('prefers explicit model over arg scan', () => {
        expect(resolveClaudeSessionModelMode({
            model: 'claude-opus-4',
            claudeArgs: ['--model', 'sonnet']
        })).toBe('opus')
    })

    it('falls back to claude args when explicit model is missing', () => {
        expect(resolveClaudeSessionModelMode({
            claudeArgs: ['--resume', '--model', 'claude-sonnet-4']
        })).toBe('sonnet')
    })

    it('keeps exact model selection while exposing normalized mode', () => {
        expect(resolveClaudeModelSelection({
            model: 'claude-sonnet-4-20250514'
        })).toEqual({
            model: 'claude-sonnet-4-20250514',
            mode: 'sonnet'
        })
    })

    it('treats auto/default model as unset', () => {
        expect(resolveClaudeModelSelection({ model: 'auto' })).toEqual({
            model: undefined,
            mode: 'default'
        })
        expect(resolveClaudeModelSelection({ model: 'default' })).toEqual({
            model: undefined,
            mode: 'default'
        })
    })

    it('extracts think effort from claude args', () => {
        expect(findClaudeThinkEffortFromArgs(['--effort', 'low'])).toBe('low')
        expect(findClaudeThinkEffortFromArgs(['--foo', 'x', '--effort=medium'])).toBe('medium')
        expect(findClaudeThinkEffortFromArgs(['--effort', 'HIGH'])).toBe('high')
        expect(findClaudeThinkEffortFromArgs(['--effort', 'xhigh'])).toBeUndefined()
    })
})
