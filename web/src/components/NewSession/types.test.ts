import { describe, expect, it } from 'vitest'
import { CLAUDE_THINK_EFFORT_OPTIONS, CODEX_THINK_EFFORT_OPTIONS, MODEL_OPTIONS } from './types'

describe('NewSession model options', () => {
    it('includes GPT-5.3 Codex in codex model options', () => {
        const codexValues = MODEL_OPTIONS.codex.map((option) => option.value)
        expect(codexValues).toContain('gpt-5.3-codex')
        expect(codexValues).toContain('gpt-5.3-codex-spark')
    })

    it('includes codex think effort options', () => {
        const thinkEfforts = CODEX_THINK_EFFORT_OPTIONS.map((option) => option.value)
        expect(thinkEfforts).toEqual(['auto', 'low', 'medium', 'high', 'xhigh'])
    })

    it('includes claude think effort options', () => {
        const thinkEfforts = CLAUDE_THINK_EFFORT_OPTIONS.map((option) => option.value)
        expect(thinkEfforts).toEqual(['auto', 'low', 'medium', 'high'])
    })
})
