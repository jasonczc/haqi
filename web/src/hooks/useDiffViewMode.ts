import { useEffect, useState } from 'react'
import { DiffModeEnum } from '@git-diff-view/react'

const DIFF_VIEW_MODE_STORAGE_KEY = 'hapi:diffViewMode'

function normalizeDiffViewMode(value: unknown): DiffModeEnum {
    if (value === 'split') return DiffModeEnum.SplitGitHub
    return DiffModeEnum.Unified
}

function readStoredDiffViewMode(): DiffModeEnum {
    if (typeof window === 'undefined') {
        return DiffModeEnum.Unified
    }
    try {
        return normalizeDiffViewMode(window.localStorage.getItem(DIFF_VIEW_MODE_STORAGE_KEY))
    } catch {
        return DiffModeEnum.Unified
    }
}

function persistDiffViewMode(mode: DiffModeEnum): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.localStorage.setItem(DIFF_VIEW_MODE_STORAGE_KEY, mode === DiffModeEnum.SplitGitHub ? 'split' : 'unified')
    } catch {
    }
}

export function useDiffViewMode(): {
    diffViewMode: DiffModeEnum
    setDiffViewMode: (mode: DiffModeEnum) => void
} {
    const [diffViewMode, setDiffViewModeState] = useState<DiffModeEnum>(readStoredDiffViewMode)

    useEffect(() => {
        persistDiffViewMode(diffViewMode)
    }, [diffViewMode])

    return {
        diffViewMode,
        setDiffViewMode: (mode: DiffModeEnum) => {
            setDiffViewModeState(normalizeDiffViewMode(mode === DiffModeEnum.SplitGitHub ? 'split' : 'unified'))
        }
    }
}
