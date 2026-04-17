import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Context/dropdown menu row. Icon + label, optional `tone="danger"` for
 * destructive actions (red text + red-tinted hover bg).
 *
 * Uses role="menuitem" for proper a11y — parent should wrap in role="menu".
 */
export type MenuItemTone = 'default' | 'danger'

export function MenuItem(props: {
    icon?: ReactNode
    children: ReactNode
    onClick?: () => void
    tone?: MenuItemTone
    disabled?: boolean
    trailing?: ReactNode
    className?: string
}) {
    const tone = props.tone ?? 'default'
    return (
        <button
            type="button"
            role="menuitem"
            onClick={props.onClick}
            disabled={props.disabled}
            data-tone={tone}
            className={cn('ui-menu-item', props.className)}
        >
            {props.icon ? <span className="ui-menu-item-icon">{props.icon}</span> : null}
            <span className="flex-1 text-left">{props.children}</span>
            {props.trailing ? <span className="ui-menu-item-trailing">{props.trailing}</span> : null}
        </button>
    )
}
