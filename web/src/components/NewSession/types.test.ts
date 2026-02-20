import { describe, expect, it } from 'vitest'
import { CODEX_THINK_EFFORT_OPTIONS, MODEL_OPTIONS } from './types'

describe('NewSession model options', () => {
    it('includes GPT-5.3 Codex in codex model options', () => {
        const codexValues = MODEL_OPTIONS.codex.map((option) => option.value)
        expect(codexValues).toContain('gpt-5.3-codex')
    })

    it('includes codex think effort options', () => {
        const thinkEfforts = CODEX_THINK_EFFORT_OPTIONS.map((option) => option.value)
        expect(thinkEfforts).toEqual(['auto', 'low', 'medium', 'high', 'xhigh'])
    })
})
