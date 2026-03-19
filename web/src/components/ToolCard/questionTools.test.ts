import { describe, expect, it } from 'vitest'
import type { ChatBlock, ChatToolCall } from '@/chat/types'
import {
    buildInitialQuestionOverlayState,
    buildQuestionToolAnswerPayload,
    buildQuestionToolModel,
    findLatestPendingQuestionOverlayTool,
    findLatestPendingQuestionTool,
    isPlanModeQuestionTool,
    maskSecretValue
} from '@/components/ToolCard/questionTools'

function makeToolCall(overrides: Partial<ChatToolCall> & Pick<ChatToolCall, 'id' | 'name' | 'input'>): ChatToolCall {
    return {
        id: overrides.id,
        name: overrides.name,
        state: overrides.state ?? 'pending',
        input: overrides.input,
        createdAt: overrides.createdAt ?? 0,
        startedAt: overrides.startedAt ?? null,
        completedAt: overrides.completedAt ?? null,
        description: overrides.description ?? null,
        result: overrides.result,
        permission: overrides.permission
    }
}

describe('questionTools', () => {
    it('normalizes request_user_input and keeps CLI-specific fields', () => {
        const tool = makeToolCall({
            id: 'tool-1',
            name: 'request_user_input',
            input: {
                questions: [
                    {
                        id: 'mode',
                        header: 'Execution',
                        question: 'How should we proceed?',
                        isOther: true,
                        isSecret: true,
                        options: [
                            { label: 'Ship it', description: 'Apply immediately' },
                            { label: 'Hold', description: 'Wait for review' }
                        ]
                    }
                ]
            }
        })

        const model = buildQuestionToolModel(tool)

        expect(model).not.toBeNull()
        expect(model?.kind).toBe('request_user_input')
        expect(model?.questions[0]).toMatchObject({
            id: 'mode',
            header: 'Execution',
            question: 'How should we proceed?',
            isSecret: true,
            supportsNotes: true
        })
        expect(model?.questions[0]?.options.map((option) => option.kind)).toEqual(['choice', 'choice', 'other'])
    })

    it('defaults single-select questions to the first real option', () => {
        const tool = makeToolCall({
            id: 'tool-1',
            name: 'request_user_input',
            input: {
                questions: [
                    {
                        id: 'mode',
                        question: 'Choose',
                        options: [
                            { label: 'Ship it' },
                            { label: 'Hold' }
                        ]
                    }
                ]
            }
        })

        const model = buildQuestionToolModel(tool)
        expect(model).not.toBeNull()
        const state = buildInitialQuestionOverlayState(model!.questions[0]!)

        expect(state.selectedOptionIds).toEqual(['option:0:Ship it'])
    })

    it('submits skipped for unanswered request_user_input questions', () => {
        const tool = makeToolCall({
            id: 'tool-1',
            name: 'request_user_input',
            input: {
                questions: [
                    {
                        id: 'mode',
                        question: 'Choose',
                        options: [
                            { label: 'Ship it' },
                            { label: 'Hold' }
                        ]
                    }
                ]
            }
        })

        const model = buildQuestionToolModel(tool)
        expect(model).not.toBeNull()

        const payload = buildQuestionToolAnswerPayload(model!, {
            mode: {
                selectedOptionIds: [],
                note: ''
            }
        })

        expect(payload).toEqual({
            answers: {
                mode: {
                    answers: ['skipped']
                }
            }
        })
    })

    it('submits freeform ask_user_question answers without synthetic other markers', () => {
        const tool = makeToolCall({
            id: 'tool-1',
            name: 'AskUserQuestion',
            input: {
                questions: [
                    {
                        id: 'reason',
                        question: 'Why?',
                        options: []
                    }
                ]
            }
        })

        const model = buildQuestionToolModel(tool)
        expect(model).not.toBeNull()
        expect(model?.questions[0]?.options).toEqual([])

        const payload = buildQuestionToolAnswerPayload(model!, {
            reason: {
                selectedOptionIds: [],
                note: 'Need more logs'
            }
        })

        expect(payload).toEqual({
            answers: {
                '0': ['Need more logs']
            }
        })
    })

    it('finds the latest pending nested question tool', () => {
        const older = makeToolCall({
            id: 'tool-1',
            name: 'request_user_input',
            createdAt: 100,
            input: { questions: [{ id: 'a', question: 'A', options: [] }] },
            permission: { id: 'perm-1', status: 'pending' }
        })
        const newer = makeToolCall({
            id: 'tool-2',
            name: 'AskUserQuestion',
            createdAt: 200,
            input: { questions: [{ question: 'B', options: [] }] },
            permission: { id: 'perm-2', status: 'pending' }
        })
        const blocks: ChatBlock[] = [
            {
                kind: 'tool-call',
                id: 'block-1',
                localId: null,
                createdAt: 100,
                tool: older,
                children: [
                    {
                        kind: 'tool-call',
                        id: 'block-2',
                        localId: null,
                        createdAt: 200,
                        tool: newer,
                        children: []
                    }
                ]
            }
        ]

        expect(findLatestPendingQuestionTool(blocks)?.id).toBe('tool-2')
    })

    it('limits overlay questions to plan-mode request_user_input prompts', () => {
        const planTool = makeToolCall({
            id: 'tool-plan',
            name: 'request_user_input',
            input: {
                questions: [
                    {
                        id: 'plan_action',
                        question: 'How should we proceed in plan mode?',
                        options: [
                            { label: 'Exit plan mode' },
                            { label: 'Hold plan mode' }
                        ]
                    }
                ]
            },
            permission: { id: 'perm-plan', status: 'pending' }
        })
        const normalRequestTool = makeToolCall({
            id: 'tool-normal',
            name: 'request_user_input',
            input: {
                questions: [
                    {
                        id: 'mcp_input',
                        question: 'Please provide the API key',
                        options: []
                    }
                ]
            },
            permission: { id: 'perm-normal', status: 'pending' }
        })
        const askTool = makeToolCall({
            id: 'tool-ask',
            name: 'AskUserQuestion',
            input: {
                questions: [{ id: 'why', question: 'Why?', options: [] }]
            },
            permission: { id: 'perm-ask', status: 'pending' }
        })

        expect(isPlanModeQuestionTool(planTool)).toBe(true)
        expect(isPlanModeQuestionTool(normalRequestTool)).toBe(false)
        expect(isPlanModeQuestionTool(askTool)).toBe(false)

        const blocks: ChatBlock[] = [
            {
                kind: 'tool-call',
                id: 'block-normal',
                localId: null,
                createdAt: 100,
                tool: normalRequestTool,
                children: []
            },
            {
                kind: 'tool-call',
                id: 'block-plan',
                localId: null,
                createdAt: 200,
                tool: planTool,
                children: [
                    {
                        kind: 'tool-call',
                        id: 'block-ask',
                        localId: null,
                        createdAt: 300,
                        tool: askTool,
                        children: []
                    }
                ]
            }
        ]

        expect(findLatestPendingQuestionOverlayTool(blocks)?.id).toBe('tool-plan')
    })

    it('keeps genuine non-plan questions available through the general question finder', () => {
        const requestTool = makeToolCall({
            id: 'tool-request',
            name: 'request_user_input',
            createdAt: 100,
            input: {
                questions: [
                    {
                        id: 'api_key',
                        question: 'Please provide the API key',
                        options: []
                    }
                ]
            },
            permission: { id: 'perm-request', status: 'pending' }
        })
        const askTool = makeToolCall({
            id: 'tool-ask',
            name: 'AskUserQuestion',
            createdAt: 200,
            input: {
                questions: [
                    {
                        id: 'branch',
                        question: 'Which branch should I edit?',
                        options: [
                            { label: 'main' },
                            { label: 'feature/test' }
                        ]
                    }
                ]
            },
            permission: { id: 'perm-ask', status: 'pending' }
        })

        const blocks: ChatBlock[] = [
            {
                kind: 'tool-call',
                id: 'block-request',
                localId: null,
                createdAt: 100,
                tool: requestTool,
                children: []
            },
            {
                kind: 'tool-call',
                id: 'block-ask',
                localId: null,
                createdAt: 200,
                tool: askTool,
                children: []
            }
        ]

        expect(findLatestPendingQuestionTool(blocks)?.id).toBe('tool-ask')
        expect(findLatestPendingQuestionOverlayTool(blocks)).toBeNull()
    })

    it('does not treat generic request_user_input options as plan mode', () => {
        const genericTool = makeToolCall({
            id: 'tool-generic',
            name: 'request_user_input',
            input: {
                questions: [
                    {
                        id: 'approval',
                        header: 'Confirm action',
                        question: 'Should I continue?',
                        options: [
                            { label: 'Yes' },
                            { label: 'No' }
                        ]
                    }
                ]
            }
        })

        expect(isPlanModeQuestionTool(genericTool)).toBe(false)
    })

    it('masks secret values without leaking length exactly', () => {
        expect(maskSecretValue('abc')).toBe('••••••')
        expect(maskSecretValue('12345678901234567890')).toBe('••••••••••••••••••')
    })
})
