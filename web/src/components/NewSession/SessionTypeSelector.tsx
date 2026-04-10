import type { RefObject } from 'react'
import { CursorChoiceRow, CursorFieldLabel, CursorRadio, CursorTextField } from '@/components/settings/CursorSettingsPrimitives'
import type { SessionType } from './types'
import { useTranslation } from '@/lib/use-translation'

export function SessionTypeSelector(props: {
    sessionType: SessionType
    worktreeName: string
    worktreeInputRef: RefObject<HTMLInputElement | null>
    isDisabled: boolean
    onSessionTypeChange: (value: SessionType) => void
    onWorktreeNameChange: (value: string) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <CursorFieldLabel>{t('newSession.type')}</CursorFieldLabel>
            <div className="flex flex-col gap-1.5">
                {(['simple', 'worktree', 'setup'] as const).map((type) => (
                    <div key={type} className="flex flex-col gap-2">
                        {type === 'worktree' ? (
                            <div className="flex items-center gap-2">
                                <CursorRadio
                                    id="session-type-worktree"
                                    name="sessionType"
                                    value="worktree"
                                    checked={props.sessionType === 'worktree'}
                                    onChange={() => props.onSessionTypeChange('worktree')}
                                    disabled={props.isDisabled}
                                />
                                <div className="flex-1">
                                    <div className="min-h-[34px] flex items-center">
                                        {props.sessionType === 'worktree' ? (
                                            <CursorTextField
                                                ref={props.worktreeInputRef}
                                                type="text"
                                                placeholder={t('newSession.type.worktree.placeholder')}
                                                value={props.worktreeName}
                                                onChange={(e) => props.onWorktreeNameChange(e.target.value)}
                                                disabled={props.isDisabled}
                                                compact
                                            />
                                        ) : (
                                            <>
                                                <label
                                                    htmlFor="session-type-worktree"
                                                    className="cursor-pointer text-[13px] leading-[18px] capitalize text-[var(--text-primary)]"
                                                >
                                                    {t('newSession.type.worktree')}
                                                </label>
                                                <span className="ml-2 text-[12px] leading-4 text-[var(--text-secondary)]">
                                                    {t('newSession.type.worktree.desc')}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : type === 'setup' ? (
                            <CursorChoiceRow
                                name="sessionType"
                                value="setup"
                                checked={props.sessionType === 'setup'}
                                onChange={() => props.onSessionTypeChange('setup')}
                                disabled={props.isDisabled}
                                label={<span className="capitalize">Setup Environment</span>}
                                description="Agent configures the development environment. Save as checkpoint when done."
                            />
                        ) : (
                            <CursorChoiceRow
                                name="sessionType"
                                value="simple"
                                checked={props.sessionType === 'simple'}
                                onChange={() => props.onSessionTypeChange('simple')}
                                disabled={props.isDisabled}
                                label={<span className="capitalize">{t('newSession.type.simple')}</span>}
                                description={t('newSession.type.simple.desc')}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
