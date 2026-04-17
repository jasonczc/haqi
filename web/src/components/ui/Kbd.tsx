import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Keyboard key badge — monospace, bordered, subtle bottom shadow.
 * Use inside <KbdHint> for chorded shortcuts.
 */
export function Kbd(props: { children: ReactNode; className?: string }) {
    return <kbd className={cn('kbd', props.className)}>{props.children}</kbd>
}

/**
 * Groups multiple Kbd keys with tight spacing, e.g. ⌘+Enter.
 * Used next to send buttons and nav items as a power-user hint.
 */
export function KbdHint(props: { children: ReactNode; className?: string }) {
    return (
        <span className={cn('kbd-hint inline-flex items-center gap-0.5', props.className)} aria-hidden>
            {props.children}
        </span>
    )
}
