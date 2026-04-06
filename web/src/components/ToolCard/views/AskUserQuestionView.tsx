import type { ReactNode } from 'react'
import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { parseAskUserQuestionInput } from '@/components/ToolCard/askUserQuestion'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'

type AnswersFormat = Record<string, string[]> | Record<string, { answers: string[] }>

/**
 * Normalize answers to flat format: Record<string, string[]>
 */
function normalizeAnswers(answers: AnswersFormat | undefined): Record<string, string[]> | undefined {
    if (!answers) return undefined
    const result: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(answers)) {
        if (Array.isArray(value)) {
            result[key] = value
        } else if (value && typeof value === 'object' && 'answers' in value) {
            result[key] = value.answers
        }
    }
    return result
}

function getSelectionMark(isMulti: boolean, isSelected: boolean): string {
    if (isMulti) {
        return isSelected ? '☑' : '☐'
    }
    return isSelected ? '●' : '○'
}

function renderOtherAnswers(
    customAnswers: string[],
    isMulti: boolean,
    customLabel: string
): ReactNode {
    if (customAnswers.length === 0) return null

    return (
        <>
            {customAnswers.map((answer, i) => (
                <div
                    key={`other-${i}`}
                    className="rounded-md border border-[var(--success)]/25 bg-[var(--success)]/10 px-2 py-2"
                >
                    <div className="flex items-start gap-2">
                        <span className="shrink-0 text-sm text-[var(--success)]">
                            {isMulti ? '☑' : '●'}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm text-[var(--success)] font-medium break-words">
                                {answer}
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--cursor-text-secondary)]">
                                {customLabel}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </>
    )
}

function renderFreeformAnswers(
    questionAnswers: string[]
): ReactNode {
    const cleaned = questionAnswers
        .map(a => a.trim())
        .filter(a => a.length > 0 && a !== 'skipped')
    if (cleaned.length === 0) return null

    return (
        <div className="mt-3 flex flex-col gap-1">
            {cleaned.map((answer, i) => (
                <div
                    key={i}
                    className="rounded-md border border-[var(--success)]/25 bg-[var(--success)]/10 px-2 py-2"
                >
                    <div className="flex items-start gap-2">
                        <span className="shrink-0 text-sm text-[var(--success)]">●</span>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm text-[var(--success)] font-medium break-words">
                                {answer}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export function AskUserQuestionView(props: ToolViewProps) {
    const { t } = useTranslation()
    const parsed = parseAskUserQuestionInput(props.block.tool.input)
    const questions = parsed.questions
    const rawAnswers = props.block.tool.permission?.answers ?? undefined
    const answers = normalizeAnswers(rawAnswers)
    const hasAnswers = answers && Object.keys(answers).length > 0

    // When questions array is empty but answers exist (fallback path),
    // render the answers directly
    if (questions.length === 0) {
        if (hasAnswers && answers) {
            return renderFreeformAnswers(answers['0'] ?? [])
        }
        return null
    }

    return (
        <div className="flex flex-col gap-3">
            {questions.map((q, idx) => {
                const isMulti = q.multiSelect
                const questionAnswers = answers?.[q.id] ?? answers?.[String(idx)] ?? []
                const trimmedAnswers = questionAnswers.map((answer) => answer.trim()).filter((answer) => answer.length > 0)
                const optionLabels = new Set(q.options.map((opt) => opt.label.trim()))
                const isSkipped = trimmedAnswers.includes('skipped')
                const customAnswers = trimmedAnswers.filter((answer) => answer !== 'skipped' && !optionLabels.has(answer))

                return (
                    <div key={q.id} className="rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] p-3">
                        {q.header ? (
                            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--cursor-text-secondary)]">
                                {q.header}
                            </div>
                        ) : null}

                        {q.question ? (
                            <div className="text-sm text-[var(--cursor-text-primary)] break-words">
                                {q.question}
                            </div>
                        ) : null}

                        {isSkipped ? (
                            <div className="mt-3 rounded-md border border-[var(--cursor-stroke-primary)] px-2 py-2 text-sm text-[var(--cursor-text-secondary)]">
                                {t('tool.questionOverlay.skippedValue')}
                            </div>
                        ) : q.options.length > 0 ? (
                            <div className="mt-3 flex flex-col gap-1">
                                {q.options.map((opt, optIdx) => {
                                    const isSelected = trimmedAnswers.includes(opt.label.trim())
                                    return (
                                        <div
                                            key={optIdx}
                                            className={cn(
                                                "rounded-md border px-2 py-2",
                                                isSelected
                                                    ? "border-[var(--success)]/25 bg-[var(--success)]/10"
                                                    : "border-[var(--cursor-stroke-primary)]"
                                            )}
                                        >
                                            <div className="flex items-start gap-2">
                                                {hasAnswers && (
                                                    <span className={cn(
                                                        "shrink-0 text-sm",
                                                        isSelected
                                                            ? "text-[var(--success)]"
                                                            : "text-[var(--cursor-text-secondary)]"
                                                    )}>
                                                        {getSelectionMark(isMulti, isSelected)}
                                                    </span>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className={cn(
                                                        "text-sm break-words",
                                                        isSelected
                                                            ? "text-[var(--success)] font-medium"
                                                            : "text-[var(--cursor-text-primary)]"
                                                    )}>
                                                        {opt.label}
                                                    </div>
                                                    {opt.description ? (
                                                        <div className="mt-0.5 text-xs text-[var(--cursor-text-secondary)] break-words">
                                                            {opt.description}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}

                                {hasAnswers ? renderOtherAnswers(customAnswers, isMulti, t('tool.questionOverlay.customValueLabel')) : null}
                            </div>
                        ) : hasAnswers && answers ? (
                            // Freeform question (no options) - show the answer directly
                            renderFreeformAnswers(questionAnswers)
                        ) : null}
                    </div>
                )
            })}
        </div>
    )
}
