import { describe, expect, it } from 'vitest'
import {
    resolveSpawnModel,
    resolveSpawnSessionSettings,
    resolveSpawnThinkEffort
} from './spawnPayload'

describe('resolveSpawnModel', () => {
    it('prefers custom model when provided', () => {
        expect(resolveSpawnModel('codex', 'auto', ' gpt-5.3-codex ')).toBe('gpt-5.3-codex')
    })

    it('drops auto/manual/default-like models', () => {
        expect(resolveSpawnModel('claude', 'auto', '')).toBeUndefined()
        expect(resolveSpawnModel('gemini', 'manual', '')).toBeUndefined()
        expect(resolveSpawnModel('gemini', 'auto-gemini-3', '')).toBeUndefined()
        expect(resolveSpawnModel('opencode', 'any-model', '')).toBeUndefined()
    })

    it('keeps explicit model for supported agents', () => {
        expect(resolveSpawnModel('claude', 'global.anthropic.claude-opus-4-6-v1', '')).toBe('global.anthropic.claude-opus-4-6-v1')
    })
})

describe('resolveSpawnThinkEffort', () => {
    it('only keeps allowed thinkEffort values per agent', () => {
        expect(resolveSpawnThinkEffort('codex', 'high')).toBe('high')
        expect(resolveSpawnThinkEffort('codex', 'auto')).toBeUndefined()
        expect(resolveSpawnThinkEffort('claude', 'medium')).toBe('medium')
        expect(resolveSpawnThinkEffort('claude', 'xhigh')).toBeUndefined()
        expect(resolveSpawnThinkEffort('gemini', 'high')).toBeUndefined()
    })
})

describe('resolveSpawnSessionSettings', () => {
    it('keeps worktree name only for worktree sessions and trims values', () => {
        expect(resolveSpawnSessionSettings('worktree', ' feature-x ', ' http://localhost:3000 ')).toEqual({
            sessionType: 'worktree',
            worktreeName: 'feature-x',
            previewUrl: 'http://localhost:3000'
        })

        expect(resolveSpawnSessionSettings('simple', 'feature-x', '   ')).toEqual({
            sessionType: 'simple',
            worktreeName: undefined,
            previewUrl: undefined
        })
    })
})
