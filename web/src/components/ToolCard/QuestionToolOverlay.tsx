import { useEffect, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { ChatToolCall } from '@/chat/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { usePlatform } from '@/hooks/usePlatform'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import {
    buildInitialQuestionOverlayState,
    buildQuestionToolAnswerPayload,
    buildQuestionToolModel,
    getQuestionOptionLabel,
    isOtherOptionSelected,
    isQuestionAnswered,
    type QuestionOverlayState,
    type QuestionToolOption,
    type QuestionToolQuestion
} from '@/components/ToolCard/questionTools'

function SelectionMark(props: { checked: boolean; mode: 'single' | 'multi' }) {
    const mark = props.mode === 'multi'
        ? (props.checked ? '☑' : '☐')
        : (props.checked ? '●' : '○')
    return (
        <span className="mt-0.5 w-4 shrink-0 text-center text-[var(--app-hint)]">
            {mark}
        </span>
    )
}

function OptionRow(props: {
    checked: boolean
    mode: 'single' | 'multi'
    disabled: boolean
    title: string
    description?: string | null
    onClick: () => void
}) {
    return (
        <button
            type="button"
            className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--app-subtle-bg)] disabled:pointer-events-none disabled:opacity-50',
                props.checked ? 'bg-[var(--app-subtle-bg)]' : null
            )}
            disabled={props.disabled}
            onClick={props.onClick}
        >
            <SelectionMark checked={props.checked} mode={props.mode} />
            <span className="min-w-0 flex-1">
                <div className="font-medium text-[var(--app-fg)] break-words">{props.title}</div>
                {props.description ? (
                    <div className="mt-0.5 text-xs text-[var(--app-hint)] break-words">
                        {props.description}
                    </div>
                ) : null}
            </span>
        </button>
    )
}

function supportsMultilineInput(question: QuestionToolQuestion): boolean {
    return !question.isSecret
}

export function QuestionToolOverlay(props: {
    api: ApiClient
    sessionId: string
    tool: ChatToolCall | null
    disabled: boolean
    onDone: () => void
}) {
    const { t } = useTranslation()
    const { haptic } = usePlatform()
    const permission = props.tool?.permission
    const model = useMemo(
        () => (props.tool ? buildQuestionToolModel(props.tool) : null),
        [props.tool]
    )

    const [step, setStep] = useState(0)
    const [stateByQuestion, setStateByQuestion] = useState<Record<string, QuestionOverlayState>>({})
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!model) {
            setStep(0)
            setStateByQuestion({})
            setLoading(false)
            setError(null)
            return
        }

        const nextState: Record<string, QuestionOverlayState> = {}
        for (const question of model.questions) {
            nextState[question.id] = buildInitialQuestionOverlayState(question)
        }

        setStep(0)
        setStateByQuestion(nextState)
        setLoading(false)
        setError(null)
    }, [model?.toolId])

    const run = async (action: () => Promise<void>, hapticType: 'success' | 'error') => {
        if (props.disabled) return
        setError(null)
        try {
            await action()
            haptic.notification(hapticType)
            props.onDone()
        } catch (cause) {
            haptic.notification('error')
            setError(cause instanceof Error ? cause.message : t('dialog.error.default'))
        }
    }

    const cancel = async () => {
        if (!permission) return
        setLoading(true)
        await run(() => props.api.denyPermission(props.sessionId, permission.id, { decision: 'abort' }), 'success')
        setLoading(false)
    }

    const total = model?.questions.length ?? 0
    const clampedStep = Math.min(Math.max(step, 0), Math.max(total - 1, 0))
    const currentQuestion = model?.questions[clampedStep] ?? null
    const currentState = currentQuestion ? stateByQuestion[currentQuestion.id] : null
    const mode = currentQuestion?.multiSelect ? 'multi' : 'single'

    const selectOption = (question: QuestionToolQuestion, option: QuestionToolOption) => {
        haptic.selection()
        setStateByQuestion((previous) => {
            const current = previous[question.id] ?? buildInitialQuestionOverlayState(question)
            const selected = new Set(current.selectedOptionIds)
            const alreadySelected = selected.has(option.id)

            if (question.multiSelect) {
                if (alreadySelected) {
                    selected.delete(option.id)
                } else {
                    selected.add(option.id)
                }
            } else if (alreadySelected) {
                selected.clear()
            } else {
                selected.clear()
                selected.add(option.id)
            }

            if (option.kind === 'choice' && !question.multiSelect) {
                selected.delete('__other__')
            }

            return {
                ...previous,
                [question.id]: {
                    ...current,
                    selectedOptionIds: Array.from(selected)
                }
            }
        })
    }

    const updateNote = (questionId: string, value: string) => {
        setStateByQuestion((previous) => ({
            ...previous,
            [questionId]: {
                ...(previous[questionId] ?? { selectedOptionIds: [], note: '' }),
                note: value
            }
        }))
    }

    const next = () => {
        if (total <= 1) return
        setError(null)
        setStep((current) => Math.min(current + 1, total - 1))
    }

    const prev = () => {
        setError(null)
        setStep((current) => Math.max(current - 1, 0))
    }

    const submit = async () => {
        if (!model || !permission || loading) return
        setLoading(true)
        const payload = buildQuestionToolAnswerPayload(model, stateByQuestion)
        await run(() => props.api.approvePermission(props.sessionId, permission.id, payload), 'success')
        setLoading(false)
    }

    useEffect(() => {
        if (!model || !permission || permission.status !== 'pending') {
            return
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || loading) {
                return
            }

            const target = event.target
            const editingText = target instanceof HTMLTextAreaElement
                || (target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio')

            if (event.key === 'Escape') {
                event.preventDefault()
                void cancel()
                return
            }

            if (editingText) {
                return
            }

            if (event.key === 'PageDown') {
                event.preventDefault()
                next()
                return
            }

            if (event.key === 'PageUp') {
                event.preventDefault()
                prev()
                return
            }

            if (event.key === 'Enter') {
                event.preventDefault()
                if (clampedStep < total - 1) {
                    next()
                } else {
                    void submit()
                }
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [cancel, clampedStep, loading, model, next, permission, prev, submit, total])

    if (!model || !permission || permission.status !== 'pending' || !currentQuestion) {
        return null
    }

    const noteVisible = currentQuestion.supportsNotes
        || currentQuestion.options.every((option) => option.kind !== 'choice')
        || isOtherOptionSelected(currentQuestion, currentState ?? undefined)

    const questionAnswered = isQuestionAnswered(currentQuestion, currentState ?? undefined)

    return (
        <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
            <div className="absolute inset-0 flex flex-col justify-end sm:justify-end sm:px-3 sm:pb-3">
                <div className="w-full rounded-t-2xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] shadow-2xl sm:mx-auto sm:max-w-2xl sm:rounded-2xl">
                    <div className="border-b border-[var(--app-border)] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Badge variant="default">{t('tool.questionOverlay.title')}</Badge>
                                    <span className="font-mono text-xs text-[var(--app-hint)]">
                                        [{clampedStep + 1}/{total}]
                                    </span>
                                </div>
                                <div className="mt-1 text-sm text-[var(--app-hint)]">
                                    {t('tool.questionOverlay.description')}
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={props.disabled || loading}
                                onClick={() => void cancel()}
                            >
                                {t('tool.questionOverlay.close')}
                            </Button>
                        </div>
                    </div>

                    <div className="max-h-[min(78vh,720px)] overflow-y-auto px-4 py-4">
                        {error ? (
                            <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {error}
                            </div>
                        ) : null}

                        {currentQuestion.header ? (
                            <div className="mb-2">
                                <Badge variant="warning">{currentQuestion.header}</Badge>
                            </div>
                        ) : null}

                        {currentQuestion.question ? (
                            <div className="text-sm text-[var(--app-fg)] break-words">
                                {currentQuestion.question}
                            </div>
                        ) : null}

                        {currentQuestion.options.length > 0 ? (
                            <div className="mt-4 flex flex-col gap-1">
                                {currentQuestion.options.map((option) => {
                                    const checked = (currentState?.selectedOptionIds ?? []).includes(option.id)
                                    return (
                                        <OptionRow
                                            key={option.id}
                                            checked={checked}
                                            mode={mode}
                                            disabled={props.disabled || loading}
                                            title={getQuestionOptionLabel(option, t('tool.questionOverlay.otherOption'))}
                                            description={option.description}
                                            onClick={() => selectOption(currentQuestion, option)}
                                        />
                                    )
                                })}
                            </div>
                        ) : null}

                        {noteVisible ? (
                            <div className="mt-4">
                                <div className="mb-1 text-xs text-[var(--app-hint)]">
                                    {currentQuestion.supportsNotes
                                        ? t('tool.questionOverlay.noteLabel')
                                        : t('tool.questionOverlay.answerLabel')}
                                </div>
                                {supportsMultilineInput(currentQuestion) ? (
                                    <textarea
                                        value={currentState?.note ?? ''}
                                        onChange={(event) => updateNote(currentQuestion.id, event.target.value)}
                                        disabled={props.disabled || loading}
                                        placeholder={currentQuestion.supportsNotes
                                            ? t('tool.questionOverlay.notePlaceholder')
                                            : t('tool.questionOverlay.answerPlaceholder')}
                                        className="w-full min-h-[88px] resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] disabled:opacity-50"
                                    />
                                ) : (
                                    <input
                                        type="password"
                                        value={currentState?.note ?? ''}
                                        onChange={(event) => updateNote(currentQuestion.id, event.target.value)}
                                        disabled={props.disabled || loading}
                                        placeholder={t('tool.questionOverlay.secretPlaceholder')}
                                        className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] disabled:opacity-50"
                                    />
                                )}
                            </div>
                        ) : null}

                        <div className="mt-3 text-xs text-[var(--app-hint)]">
                            {questionAnswered
                                ? t('tool.questionOverlay.readyHint')
                                : t('tool.questionOverlay.skippedHint')}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-[var(--app-border)] px-4 py-3">
                        <div className="flex items-center gap-2">
                            {total > 1 ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={props.disabled || loading || clampedStep === 0}
                                    onClick={prev}
                                >
                                    {t('tool.prev')}
                                </Button>
                            ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                            {total > 1 && clampedStep < total - 1 ? (
                                <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    disabled={props.disabled || loading}
                                    onClick={next}
                                >
                                    {t('tool.next')}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    disabled={props.disabled || loading}
                                    onClick={() => void submit()}
                                    aria-busy={loading}
                                    className="gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />
                                            {t('tool.submitting')}
                                        </>
                                    ) : (
                                        t('tool.submit')
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
