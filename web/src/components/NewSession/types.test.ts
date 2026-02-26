import { describe, expect, it } from 'vitest'
import { CLAUDE_THINK_EFFORT_OPTIONS, CODEX_THINK_EFFORT_OPTIONS, MODEL_OPTIONS } from './types'

describe('NewSession model options', () => {
    it('uses fixed Claude model presets', () => {
        const claudeValues = MODEL_OPTIONS.claude.map((option) => option.value)
        expect(claudeValues).toEqual([
            'us.anthropic.claude-sonnet-4-6[1m]',
            'global.anthropic.claude-opus-4-6-v1[1m]',
            'auto',
            'us.anthropic.claude-sonnet-4-6',
            'global.anthropic.claude-opus-4-6-v1',
            'global.anthropic.claude-haiku-4-5-20251001-v1:0'
        ])
    })

    it('includes GPT-5.3 Codex in codex model options', () => {
        const codexValues = MODEL_OPTIONS.codex.map((option) => option.value)
        expect(codexValues).toContain('gpt-5.3-codex')
    })

    it('uses Gemini auto/manual presets', () => {
        const geminiValues = MODEL_OPTIONS.gemini.map((option) => option.value)
        expect(geminiValues).toEqual(['auto-gemini-3', 'auto-gemini-2.5', 'manual'])
    })

    it('includes Claude think effort options', () => {
        const thinkEfforts = CLAUDE_THINK_EFFORT_OPTIONS.map((option) => option.value)
        expect(thinkEfforts).toEqual(['high', 'auto', 'low', 'medium'])
    })

    it('includes codex think effort options', () => {
        const thinkEfforts = CODEX_THINK_EFFORT_OPTIONS.map((option) => option.value)
        expect(thinkEfforts).toEqual(['xhigh', 'auto', 'low', 'medium', 'high'])
    })
})
