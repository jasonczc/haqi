import type { ChatBlock, ChatToolCall } from '@/chat/types'
import {
    getAskUserQuestionAnswerKey,
    isAskUserQuestionToolName,
    parseAskUserQuestionInput,
    type AskUserQuestionQuestion
} from '@/components/ToolCard/askUserQuestion'
import {
    isRequestUserInputToolName,
    parseRequestUserInputInput,
    type RequestUserInputQuestion
} from '@/components/ToolCard/requestUserInput'

export type QuestionToolKind = 'ask_user_question' | 'request_user_input'

export type QuestionOptionKind = 'choice' | 'other'

export type QuestionToolOption = {
    id: string
    label: string | null
    description: string | null
    kind: QuestionOptionKind
}

export type QuestionToolQuestion = {
    id: string
    answerKey: string
    toolKind: QuestionToolKind
    header: string | null
    question: string | null
    options: QuestionToolOption[]
    multiSelect: boolean
    isSecret: boolean
    supportsNotes: boolean
}

export type QuestionToolModel = {
    toolId: string
    requestId: string
    toolName: string
    kind: QuestionToolKind
    questions: QuestionToolQuestion[]
}

export type QuestionOverlayState = {
    selectedOptionIds: string[]
    note: string
}

export type ParsedQuestionAnswer = {
    selectedOptionLabels: string[]
    otherAnswer: string | null
    userNote: string | null
    isSkipped: boolean
}

const OTHER_OPTION_ID = '__other__'

function isQuestionToolCall(tool: ChatToolCall): boolean {
    return isAskUserQuestionToolName(tool.name) || isRequestUserInputToolName(tool.name)
}

function normalizeQuestionHint(value: string | null | undefined): string {
    return typeof value === 'string'
        ? value.trim().toLowerCase()
        : ''
}

function includesPlanModeHint(value: string | null | undefined): boolean {
    const normalized = normalizeQuestionHint(value)
    if (!normalized) {
        return false
    }
    return normalized.includes('plan mode')
        || normalized.includes('keep planning')
        || normalized.includes('hold plan mode')
        || normalized.includes('exit plan mode')
}

export function isPlanModeQuestionTool(tool: ChatToolCall): boolean {
    if (!isRequestUserInputToolName(tool.name)) {
        return false
    }

    const { questions } = parseRequestUserInputInput(tool.input)
    if (questions.length === 0) {
        return false
    }

    return questions.some((question) => {
        const normalizedId = normalizeQuestionHint(question.id)
        if (normalizedId === 'plan_action' || normalizedId === 'plan-action' || normalizedId === 'plan_mode_action') {
            return true
        }

        if (includesPlanModeHint(question.header) || includesPlanModeHint(question.question)) {
            return true
        }

        return question.options.some((option) => includesPlanModeHint(option.label) || includesPlanModeHint(option.description))
    })
}

function buildAskQuestion(question: AskUserQuestionQuestion, index: number): QuestionToolQuestion {
    const options: QuestionToolOption[] = question.options.map((option, optionIndex) => ({
        id: `option:${optionIndex}:${option.label}`,
        label: option.label,
        description: option.description,
        kind: 'choice'
    }))

    if (options.length > 0) {
        options.push({
            id: OTHER_OPTION_ID,
            label: null,
            description: null,
            kind: 'other'
        })
    }

    return {
        id: question.id,
        answerKey: getAskUserQuestionAnswerKey(question, index),
        toolKind: 'ask_user_question',
        header: question.header,
        question: question.question.trim().length > 0 ? question.question : null,
        options,
        multiSelect: question.multiSelect,
        isSecret: false,
        supportsNotes: false
    }
}

function buildRequestQuestion(question: RequestUserInputQuestion): QuestionToolQuestion {
    const options: QuestionToolOption[] = question.options.map((option, optionIndex) => ({
        id: `option:${optionIndex}:${option.label}`,
        label: option.label,
        description: option.description,
        kind: 'choice'
    }))

    if (question.isOther) {
        options.push({
            id: OTHER_OPTION_ID,
            label: null,
            description: null,
            kind: 'other'
        })
    }

    return {
        id: question.id,
        answerKey: question.id,
        toolKind: 'request_user_input',
        header: question.header,
        question: question.question,
        options,
        multiSelect: false,
        isSecret: question.isSecret,
        supportsNotes: true
    }
}

export function isQuestionToolName(toolName: string): boolean {
    return isAskUserQuestionToolName(toolName) || isRequestUserInputToolName(toolName)
}

export function buildQuestionToolModel(tool: ChatToolCall): QuestionToolModel | null {
    if (!isQuestionToolCall(tool)) {
        return null
    }

    if (isRequestUserInputToolName(tool.name)) {
        const questions = parseRequestUserInputInput(tool.input).questions.map(buildRequestQuestion)
        if (questions.length === 0) {
            return null
        }
        return {
            toolId: tool.id,
            requestId: tool.permission?.id ?? tool.id,
            toolName: tool.name,
            kind: 'request_user_input',
            questions
        }
    }

    const rawQuestions = parseAskUserQuestionInput(tool.input).questions
    const questions = rawQuestions.map((question, index) => buildAskQuestion(question, index))
    if (questions.length === 0) {
        return null
    }
    return {
        toolId: tool.id,
        requestId: tool.permission?.id ?? tool.id,
        toolName: tool.name,
        kind: 'ask_user_question',
        questions
    }
}

export function buildInitialQuestionOverlayState(question: QuestionToolQuestion): QuestionOverlayState {
    const firstChoice = question.options.find((option) => option.kind === 'choice')
    return {
        selectedOptionIds: firstChoice ? [firstChoice.id] : [],
        note: ''
    }
}

export function isOtherOptionSelected(question: QuestionToolQuestion, state: QuestionOverlayState | undefined): boolean {
    if (!state) {
        return false
    }
    return state.selectedOptionIds.includes(OTHER_OPTION_ID)
}

function resolveSelectedLabels(question: QuestionToolQuestion, state: QuestionOverlayState): string[] {
    const labels = question.options
        .filter((option) => option.kind === 'choice' && option.label && state.selectedOptionIds.includes(option.id))
        .map((option) => option.label as string)

    return Array.from(new Set(labels))
}

function hasRealSelection(question: QuestionToolQuestion, state: QuestionOverlayState): boolean {
    return resolveSelectedLabels(question, state).length > 0 || (isOtherOptionSelected(question, state) && state.note.trim().length > 0)
}

export function buildQuestionToolAnswerPayload(
    model: QuestionToolModel,
    stateByQuestion: Record<string, QuestionOverlayState>
): { answers: Record<string, string[]> | Record<string, { answers: string[] }> } {
    if (model.kind === 'request_user_input') {
        const answers: Record<string, { answers: string[] }> = {}

        for (const question of model.questions) {
            const state = stateByQuestion[question.id] ?? buildInitialQuestionOverlayState(question)
            const selectedLabels = resolveSelectedLabels(question, state)
            const note = state.note.trim()
            const useOther = isOtherOptionSelected(question, state)

            const answerItems: string[] = []
            if (useOther && note.length > 0) {
                answerItems.push(note)
            } else {
                answerItems.push(...selectedLabels)
                if (question.supportsNotes && note.length > 0) {
                    answerItems.push(`user_note: ${note}`)
                }
            }

            answers[question.answerKey] = {
                answers: answerItems.length > 0 ? answerItems : ['skipped']
            }
        }

        return { answers }
    }

    const answers: Record<string, string[]> = {}
    for (const question of model.questions) {
        const state = stateByQuestion[question.id] ?? buildInitialQuestionOverlayState(question)
        const selectedLabels = resolveSelectedLabels(question, state)
        const note = state.note.trim()
        const useOther = isOtherOptionSelected(question, state)

        const answerItems: string[] = [...selectedLabels]
        if (useOther && note.length > 0) {
            answerItems.push(note)
        } else if (question.options.filter((option) => option.kind === 'choice').length === 0 && note.length > 0) {
            answerItems.push(note)
        }

        answers[question.answerKey] = answerItems.length > 0 ? answerItems : ['skipped']
    }

    return { answers }
}

export function parseQuestionAnswerItems(items: string[]): ParsedQuestionAnswer {
    let otherAnswer: string | null = null
    let userNote: string | null = null
    let isSkipped = false
    const selectedOptionLabels: string[] = []

    for (const item of items) {
        const trimmed = item.trim()
        if (!trimmed) {
            continue
        }
        if (trimmed === 'skipped') {
            isSkipped = true
            continue
        }
        if (trimmed.startsWith('user_note: ')) {
            userNote = trimmed.slice('user_note: '.length).trim() || null
            continue
        }
        if (selectedOptionLabels.length === 0) {
            selectedOptionLabels.push(trimmed)
            continue
        }
        otherAnswer ??= trimmed
    }

    return {
        selectedOptionLabels,
        otherAnswer,
        userNote,
        isSkipped
    }
}

export function maskSecretValue(value: string): string {
    const length = Math.max(6, Math.min(18, value.trim().length || 6))
    return '•'.repeat(length)
}

export function findLatestPendingQuestionTool(blocks: ChatBlock[]): ChatToolCall | null {
    let latest: ChatToolCall | null = null

    const visit = (block: ChatBlock) => {
        if (block.kind !== 'tool-call') {
            return
        }

        const tool = block.tool
        if (tool.permission?.status === 'pending' && isQuestionToolCall(tool)) {
            if (!latest || tool.createdAt >= latest.createdAt) {
                latest = tool
            }
        }

        for (const child of block.children) {
            visit(child)
        }
    }

    for (const block of blocks) {
        visit(block)
    }

    return latest
}

export function findLatestPendingQuestionOverlayTool(blocks: ChatBlock[]): ChatToolCall | null {
    let latest: ChatToolCall | null = null

    const visit = (block: ChatBlock) => {
        if (block.kind !== 'tool-call') {
            return
        }

        const tool = block.tool
        if (tool.permission?.status === 'pending' && isPlanModeQuestionTool(tool)) {
            if (!latest || tool.createdAt >= latest.createdAt) {
                latest = tool
            }
        }

        for (const child of block.children) {
            visit(child)
        }
    }

    for (const block of blocks) {
        visit(block)
    }

    return latest
}

export function isQuestionAnswered(question: QuestionToolQuestion, state: QuestionOverlayState | undefined): boolean {
    if (!state) {
        return false
    }

    if (question.toolKind === 'request_user_input') {
        return hasRealSelection(question, state) || state.note.trim().length > 0
    }

    if (question.options.every((option) => option.kind !== 'choice')) {
        return state.note.trim().length > 0
    }

    if (isOtherOptionSelected(question, state)) {
        return state.note.trim().length > 0
    }

    return resolveSelectedLabels(question, state).length > 0
}

export function getQuestionOptionLabel(option: QuestionToolOption, otherLabel: string): string {
    if (option.kind === 'other') {
        return otherLabel
    }
    return option.label ?? ''
}
