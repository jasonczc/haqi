import { useCallback, useEffect, useState } from 'react'

const DIFF_SOFT_WRAP_STORAGE_KEY = 'hapi:diffSoftWrap'

function readStoredDiffSoftWrap(): boolean {
    if (typeof window === 'undefined') return true
    const value = window.localStorage.getItem(DIFF_SOFT_WRAP_STORAGE_KEY)
    if (value === '0') return false
    if (value === '1') return true
    return true
}

export function useDiffSoftWrap(): { softWrap: boolean; toggleSoftWrap: () => void; setSoftWrap: (value: boolean) => void } {
    const [softWrap, setSoftWrapState] = useState<boolean>(() => readStoredDiffSoftWrap())

    useEffect(() => {
        setSoftWrapState(readStoredDiffSoftWrap())
    }, [])

    const setSoftWrap = useCallback((value: boolean) => {
        setSoftWrapState(value)
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(DIFF_SOFT_WRAP_STORAGE_KEY, value ? '1' : '0')
        }
    }, [])

    const toggleSoftWrap = useCallback(() => {
        setSoftWrap(!softWrap)
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(DIFF_SOFT_WRAP_STORAGE_KEY, !softWrap ? '1' : '0')
        }
    }, [softWrap, setSoftWrap])

    return { softWrap, toggleSoftWrap, setSoftWrap }
}
