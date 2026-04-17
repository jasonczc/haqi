import { describe, expect, it } from 'vitest'
import {
    normalizeNetworkPolicyInput,
    resolveSpawnModel,
    resolveSpawnServiceTier,
    resolveSpawnSessionSettings,
    resolveSpawnThinkEffort,
    parseListInput,
    parsePreviewPortInput
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
        expect(resolveSpawnModel('claude', 'opus', '')).toBe('opus')
        expect(resolveSpawnModel('claude', 'claude-opus-4-6', '')).toBe('claude-opus-4-6')
    })
})

describe('resolveSpawnThinkEffort', () => {
    it('only keeps allowed thinkEffort values per agent', () => {
        expect(resolveSpawnThinkEffort('codex', 'high')).toBe('high')
        expect(resolveSpawnThinkEffort('codex', 'auto')).toBeUndefined()
        expect(resolveSpawnThinkEffort('claude', 'medium')).toBe('medium')
        expect(resolveSpawnThinkEffort('claude', 'max')).toBe('max')
        expect(resolveSpawnThinkEffort('claude', 'xhigh')).toBe('xhigh')
        expect(resolveSpawnThinkEffort('gemini', 'high')).toBeUndefined()
    })
})

describe('resolveSpawnServiceTier', () => {
    it('only keeps codex fast/flex service tiers', () => {
        expect(resolveSpawnServiceTier('codex', 'fast')).toBe('fast')
        expect(resolveSpawnServiceTier('codex', 'flex')).toBe('flex')
        expect(resolveSpawnServiceTier('codex', 'auto')).toBeUndefined()
        expect(resolveSpawnServiceTier('claude', 'fast')).toBeUndefined()
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

describe('parseListInput', () => {
    it('splits labels and secrets on commas/newlines and deduplicates values', () => {
        expect(parseListInput('alpha, beta\nalpha\n  gamma  ')).toEqual(['alpha', 'beta', 'gamma'])
        expect(parseListInput('   ')).toBeUndefined()
    })
})

describe('parsePreviewPortInput', () => {
    it('parses valid preview ports and rejects invalid values', () => {
        expect(parsePreviewPortInput('3000')).toBe(3000)
        expect(parsePreviewPortInput(' 4173 ')).toBe(4173)
        expect(parsePreviewPortInput('0')).toBeUndefined()
        expect(parsePreviewPortInput('abc')).toBeUndefined()
    })
})

describe('normalizeNetworkPolicyInput', () => {
    it('keeps known network modes', () => {
        expect(normalizeNetworkPolicyInput('default')).toBe('default')
        expect(normalizeNetworkPolicyInput('restricted')).toBe('restricted')
        expect(normalizeNetworkPolicyInput('off')).toBe('off')
        expect(normalizeNetworkPolicyInput('unknown')).toBeUndefined()
    })
})
