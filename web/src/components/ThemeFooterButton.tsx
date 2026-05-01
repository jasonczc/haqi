import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties
} from 'react'
import { useThemePreference, type ThemePreference } from '@/hooks/useTheme'

const OPTIONS: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'Match system' }
]

function SunIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
    )
}

function MoonIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

export function ThemeFooterButton() {
    const { themePreference, setThemePreference } = useThemePreference()
    const [open, setOpen] = useState(false)
    const anchorRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    const updatePosition = useCallback(() => {
        const anchor = anchorRef.current
        const menu = menuRef.current
        if (!anchor || !menu) return
        const a = anchor.getBoundingClientRect()
        const m = menu.getBoundingClientRect()
        const padding = 8
        const gap = 6

        const container = anchor.closest('.sidebar') as HTMLElement | null
        const bounds = container
            ? container.getBoundingClientRect()
            : { left: 0, right: window.innerWidth }

        const rightLimit = bounds.right - padding
        const leftLimit = bounds.left + padding
        const right = Math.min(a.right, rightLimit)
        const left = Math.max(leftLimit, right - m.width)

        const top = a.top - m.height - gap
        setPos({ top: Math.max(padding, top), left })
    }, [])

    useLayoutEffect(() => {
        if (open) updatePosition()
    }, [open, updatePosition])

    useEffect(() => {
        if (!open) return
        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target as Node
            if (menuRef.current?.contains(target)) return
            if (anchorRef.current?.contains(target)) return
            setOpen(false)
        }
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        const handleReflow = () => updatePosition()
        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKey)
        window.addEventListener('resize', handleReflow)
        window.addEventListener('scroll', handleReflow, true)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKey)
            window.removeEventListener('resize', handleReflow)
            window.removeEventListener('scroll', handleReflow, true)
        }
    }, [open, updatePosition])

    const menuStyle: CSSProperties = pos
        ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 200 }
        : { position: 'fixed', visibility: 'hidden', zIndex: 200 }

    const isDark = themePreference === 'dark'

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                className="icon-button theme-footer-btn"
                title="Theme"
                aria-label="Theme"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {isDark ? <MoonIcon /> : <SunIcon />}
            </button>

            {open ? (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Theme"
                    className="context-menu theme-menu"
                    style={menuStyle}
                >
                    <div className="theme-menu-section-label">Theme</div>
                    {OPTIONS.map((opt) => {
                        const active = themePreference === opt.value
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                className="menu-action theme-option"
                                onClick={() => {
                                    setThemePreference(opt.value)
                                    setOpen(false)
                                }}
                            >
                                <span>{opt.label}</span>
                                <span className="theme-option-check" aria-hidden={!active}>
                                    {active ? <CheckIcon /> : null}
                                </span>
                            </button>
                        )
                    })}
                </div>
            ) : null}
        </>
    )
}
