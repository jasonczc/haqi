import { cn } from '@/lib/utils'
import type { ReviewLoopUserPreference } from '@/types/api'

type LoopSettingsPanelProps = {
    userPreference: ReviewLoopUserPreference
    maxRounds: number
    currentRound: number
    onUpdatePreference: (pref: ReviewLoopUserPreference) => void
    onUpdateMaxRounds: (n: number) => void
    disabled: boolean
}

const PREFERENCE_OPTIONS: Array<{ value: ReviewLoopUserPreference; label: string; description: string }> = [
    { value: 'auto', label: 'auto', description: 'Reviewer decides when to notify' },
    { value: 'verbose', label: 'verbose', description: 'Notify every round' },
    { value: 'silent', label: 'silent', description: 'Only on completion/failure' },
]

export function LoopSettingsPanel({
    userPreference,
    maxRounds,
    currentRound,
    onUpdatePreference,
    onUpdateMaxRounds,
    disabled,
}: LoopSettingsPanelProps) {
    return (
        <div className="font-mono text-xs min-w-0">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {/* Notification mode */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[var(--app-hint)]">notify</span>
                    <div className="flex items-center gap-0.5 flex-wrap">
                        {PREFERENCE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                title={opt.description}
                                disabled={disabled}
                                onClick={() => onUpdatePreference(opt.value)}
                                className={cn(
                                    'rounded-sm px-2 py-0.5 font-mono text-xs transition-colors',
                                    userPreference === opt.value
                                        ? 'border border-[var(--app-link)] text-[var(--app-fg)]'
                                        : 'border border-transparent text-[var(--app-hint)] hover:text-[var(--app-fg)]',
                                    disabled && 'cursor-not-allowed opacity-50'
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Rounds control */}
                <div className="flex items-center gap-2">
                    <span className="text-[var(--app-hint)]">rounds</span>
                    <div className="flex items-center gap-0">
                        <button
                            type="button"
                            disabled={disabled || maxRounds <= 1}
                            onClick={() => onUpdateMaxRounds(maxRounds - 1)}
                            className="text-[var(--app-hint)] hover:text-[var(--app-fg)] disabled:opacity-30 disabled:cursor-not-allowed px-1 font-mono text-xs"
                        >
                            &#x25C0;
                        </button>
                        <span className="text-[var(--app-fg)] tabular-nums min-w-[3ch] text-center">
                            {currentRound}/{maxRounds}
                        </span>
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onUpdateMaxRounds(maxRounds + 1)}
                            className="text-[var(--app-hint)] hover:text-[var(--app-fg)] disabled:opacity-30 disabled:cursor-not-allowed px-1 font-mono text-xs"
                        >
                            &#x25B6;
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
