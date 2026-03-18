import { describe, expect, it } from 'vitest'
import { getExitPlanText, isExitPlanToolName } from '@/components/ToolCard/exitPlanMode'

describe('exitPlanMode', () => {
    it('recognizes exit plan tool names', () => {
        expect(isExitPlanToolName('ExitPlanMode')).toBe(true)
        expect(isExitPlanToolName('exit_plan_mode')).toBe(true)
        expect(isExitPlanToolName('request_user_input')).toBe(false)
    })

    it('reads plan text from both legacy and app-server payloads', () => {
        expect(getExitPlanText({ plan: 'legacy plan body' })).toBe('legacy plan body')
        expect(getExitPlanText({ text: 'app-server plan body' })).toBe('app-server plan body')
        expect(getExitPlanText({ message: 'message body' })).toBe('message body')
        expect(getExitPlanText({ markdown: 'markdown body' })).toBe('markdown body')
        expect(getExitPlanText({})).toBeNull()
    })
})
