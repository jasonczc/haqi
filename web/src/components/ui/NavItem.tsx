import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Sidebar nav item — icon + label + optional trailing slot (kbd / badge).
 *
 * Two visual weights mirror Cursor-style navigation:
 *   - primary:  elevated CTA row (tinted bg + blue icon tile)
 *   - secondary: default muted row with ghost hover
 *
 * `active` highlights the currently-selected page (same look as hover
 * but stays applied after click). Keep it off for action buttons.
 */
export type NavItemVariant = 'primary' | 'secondary'

export function NavItem(props: {
    icon: ReactNode
    children: ReactNode
    trailing?: ReactNode
    variant?: NavItemVariant
    active?: boolean
    onClick?: (e: ReactMouseEvent) => void
    disabled?: boolean
    title?: string
    'aria-label'?: string
    className?: string
}) {
    const variant = props.variant ?? 'secondary'
    return (
        <button
            type="button"
            onClick={props.onClick}
            disabled={props.disabled}
            title={props.title}
            aria-label={props['aria-label']}
            aria-current={props.active ? 'page' : undefined}
            className={cn('nav-item', `nav-item--${variant}`, props.active && 'nav-item--active', props.className)}
        >
            <span className={cn('nav-item-icon', variant === 'primary' && 'nav-item-icon--primary')}>
                {props.icon}
            </span>
            <span className="flex-1 text-left">{props.children}</span>
            {props.trailing ? <span className="nav-item-trailing">{props.trailing}</span> : null}
        </button>
    )
}
