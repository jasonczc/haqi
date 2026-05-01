import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Icon button for the chat composer toolbar.
 *
 * Thin specialized wrapper — not using generic <Button> because the composer
 * row has unique needs: (1) rounded-full rather than rounded-md, (2) hover
 * text color shifts per semantic tone (accent/success/danger), (3) an optional
 * top-right count badge, (4) an "active" toggle state for persistent on/off.
 *
 * All visual rules live in .composer-icon-btn in cursor-theme-v2.css so every
 * composer button stays in sync.
 */
export type ComposerIconTone = 'neutral' | 'accent' | 'success' | 'danger'

export function ComposerIconButton(props: {
    icon: ReactNode
    onClick?: () => void
    onMouseDown?: (e: ReactMouseEvent) => void
    disabled?: boolean
    tone?: ComposerIconTone
    active?: boolean
    title?: string
    'aria-label'?: string
    className?: string
    type?: 'button' | 'submit'
    badge?: ReactNode
}) {
    const tone = props.tone ?? 'neutral'
    return (
        <button
            type={props.type ?? 'button'}
            onClick={props.onClick}
            onMouseDown={props.onMouseDown}
            disabled={props.disabled}
            title={props.title}
            aria-label={props['aria-label']}
            data-tone={tone}
            data-active={props.active ? '' : undefined}
            className={cn('composer-icon-btn', props.className)}
        >
            {props.icon}
            {props.badge}
        </button>
    )
}
