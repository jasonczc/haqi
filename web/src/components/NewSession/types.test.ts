import { describe, expect, it } from 'vitest'
import { CLAUDE_THINK_EFFORT_OPTIONS, CODEX_SERVICE_TIER_OPTIONS, CODEX_THINK_EFFORT_OPTIONS, MODEL_OPTIONS, getModelOptionsForAgent } from './types'

describe('NewSession model options', () => {
    it('uses fixed Claude model presets', () => {
        const claudeValues = MODEL_OPTIONS.claude.map((option) => option.value)
        expect(claudeValues).toEqual([
            'auto',
            'sonnet',
            'opus',
            'haiku',
            'claude-sonnet-4-6',
            'claude-opus-4-6',
            'claude-haiku-4-5-20251001'
        ])
    })

    it('includes latest Codex model presets', () => {
        const codexValues = MODEL_OPTIONS.codex.map((option) => option.value)
        expect(codexValues).toContain('gpt-5.4')
        expect(codexValues).toContain('gpt-5.3-codex')
    })

    it('uses Gemini auto/manual presets', () => {
        const geminiValues = MODEL_OPTIONS.gemini.map((option) => option.value)
        expect(geminiValues).toEqual(['auto-gemini-3', 'auto-gemini-2.5', 'manual'])
    })

    it('includes Claude think effort options', () => {
        const thinkEfforts = CLAUDE_THINK_EFFORT_OPTIONS.map((option) => option.value)
        expect(thinkEfforts).toEqual(['max', 'high', 'auto', 'low', 'medium'])
    })

    it('includes codex think effort options', () => {
        const thinkEfforts = CODEX_THINK_EFFORT_OPTIONS.map((option) => option.value)
        expect(thinkEfforts).toEqual(['xhigh', 'auto', 'low', 'medium', 'high'])
    })

    it('includes codex service tier options', () => {
        const serviceTiers = CODEX_SERVICE_TIER_OPTIONS.map((option) => option.value)
        expect(serviceTiers).toEqual(['auto', 'fast', 'flex'])
    })
})


it('filters model options by agent flavor', () => {
    const claudeValues = getModelOptionsForAgent('claude').map((option) => option.value)
    const codexValues = getModelOptionsForAgent('codex').map((option) => option.value)

    expect(claudeValues.every((value) => value === 'auto' || value === 'sonnet' || value === 'opus' || value === 'haiku' || value.startsWith('claude-') || value.startsWith('us.anthropic.') || value.startsWith('global.anthropic.'))).toBe(true)
    expect(claudeValues).not.toContain('gpt-5.4')
    expect(codexValues.filter((value) => value === 'gpt-5.4')).toHaveLength(1)
})
