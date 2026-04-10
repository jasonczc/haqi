import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ChipPopoverProps = {
    open: boolean
    onClose: () => void
    anchorRef: React.RefObject<HTMLButtonElement | null>
    children: ReactNode
    width?: number
}

export function ChipPopover({ open, onClose, anchorRef, children, width = 280 }: ChipPopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    useEffect(() => {
        if (!open || !anchorRef.current) return
        const rect = anchorRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        let left = rect.left
        if (left + width > viewportWidth - 8) {
            left = viewportWidth - width - 8
        }
        setPos({ top: rect.bottom + 6, left: Math.max(8, left) })
    }, [open, anchorRef, width])

    useEffect(() => {
        if (!open) return
        const handleClick = (e: MouseEvent) => {
            if (popoverRef.current?.contains(e.target as Node)) return
            if (anchorRef.current?.contains(e.target as Node)) return
            onClose()
        }
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('pointerdown', handleClick)
        document.addEventListener('keydown', handleKey)
        return () => {
            document.removeEventListener('pointerdown', handleClick)
            document.removeEventListener('keydown', handleKey)
        }
    }, [open, onClose, anchorRef])

    if (!open || !pos) return null

    return createPortal(
        <div
            ref={popoverRef}
            className="chip-popover"
            style={{ top: pos.top, left: pos.left, width }}
        >
            {children}
        </div>,
        document.body
    )
}

export function PopoverGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="chip-popover-group">
            <div className="chip-popover-label">{label}</div>
            {children}
        </div>
    )
}

export function PopoverRow({
    label, children, description
}: {
    label: string
    children: ReactNode
    description?: string
}) {
    return (
        <div className="chip-popover-row">
            <div className="chip-popover-row-left">
                <span className="chip-popover-row-label">{label}</span>
                {description ? <span className="chip-popover-row-desc">{description}</span> : null}
            </div>
            <div className="chip-popover-row-right">{children}</div>
        </div>
    )
}

export function PopoverOption({
    selected, onClick, children
}: {
    selected: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            type="button"
            className={`chip-popover-option ${selected ? 'selected' : ''}`}
            onClick={onClick}
        >
            {children}
            {selected ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : null}
        </button>
    )
}

export function PopoverPillRow({
    options, value, onChange
}: {
    options: { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="chip-popover-pills">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    className={`chip-popover-pill ${o.value === value ? 'active' : ''}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}
