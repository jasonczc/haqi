import { memo, ReactNode } from 'react'

interface FloatingOverlayProps {
    children: ReactNode
    maxHeight?: number
}

/**
 * A floating panel container with shadow and rounded corners
 * Used for autocomplete suggestions and settings panels
 */
export const FloatingOverlay = memo(function FloatingOverlay(props: FloatingOverlayProps) {
    const { children, maxHeight = 240 } = props

    return (
        <div
            className="overflow-hidden rounded-[10px] border border-[var(--border-secondary)] bg-[var(--bg-editor)] shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)] animate-menu-pop"
            style={{ maxHeight, transformOrigin: 'top center' }}
        >
            <div className="overflow-y-auto" style={{ maxHeight }}>
                {children}
            </div>
        </div>
    )
})
