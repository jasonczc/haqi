import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties
} from 'react'
import { useTranslation } from '@/lib/use-translation'

type SessionActionMenuProps = {
    isOpen: boolean
    onClose: () => void
    sessionActive: boolean
    onRename: () => void
    onSpawnSameConfig?: () => void
    onDuplicate?: () => void
    onSaveCheckpoint?: () => void
    onPushCredentials?: () => void
    pushCredentialsPending?: boolean
    onArchive: () => void
    onDelete: () => void
    anchorPoint: { x: number; y: number }
    align?: 'center' | 'end'
    menuId?: string
}

type MenuPosition = {
    top: number
    left: number
    transformOrigin: string
}

export function SessionActionMenu(props: SessionActionMenuProps) {
    const { t } = useTranslation()
    const {
        isOpen,
        onClose,
        sessionActive,
        onRename,
        onSpawnSameConfig,
        onDuplicate,
        onSaveCheckpoint,
        onPushCredentials,
        pushCredentialsPending,
        onArchive,
        onDelete,
        anchorPoint,
        align = 'center',
        menuId
    } = props
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
    const internalId = useId()
    const resolvedMenuId = menuId ?? `session-action-menu-${internalId}`

    const handleRename = () => {
        onClose()
        onRename()
    }

    const handleArchive = () => {
        onClose()
        onArchive()
    }

    const handleSpawnSameConfig = () => {
        if (!onSpawnSameConfig) return
        onClose()
        onSpawnSameConfig()
    }

    const handleDuplicate = () => {
        if (!onDuplicate) return
        onClose()
        onDuplicate()
    }

    const handleSaveCheckpoint = () => {
        if (!onSaveCheckpoint) return
        onClose()
        onSaveCheckpoint()
    }

    const handlePushCredentials = () => {
        if (!onPushCredentials) return
        onClose()
        onPushCredentials()
    }

    const handleDelete = () => {
        onClose()
        onDelete()
    }

    const updatePosition = useCallback(() => {
        const menuEl = menuRef.current
        if (!menuEl) return

        const menuRect = menuEl.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const padding = 8
        const gap = 4

        const spaceBelow = viewportHeight - anchorPoint.y
        const spaceAbove = anchorPoint.y
        const openAbove = spaceBelow < menuRect.height + gap && spaceAbove > spaceBelow

        let top = openAbove ? anchorPoint.y - menuRect.height - gap : anchorPoint.y + gap
        let left = align === 'end' ? anchorPoint.x - menuRect.width : anchorPoint.x - menuRect.width / 2
        const transformOrigin =
            align === 'end'
                ? (openAbove ? 'bottom right' : 'top right')
                : (openAbove ? 'bottom center' : 'top center')

        top = Math.min(Math.max(top, padding), viewportHeight - menuRect.height - padding)
        left = Math.min(Math.max(left, padding), viewportWidth - menuRect.width - padding)

        setMenuPosition({ top, left, transformOrigin })
    }, [anchorPoint, align])

    useLayoutEffect(() => {
        if (!isOpen) return
        updatePosition()
    }, [isOpen, updatePosition])

    useEffect(() => {
        if (!isOpen) {
            setMenuPosition(null)
            return
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node
            if (menuRef.current?.contains(target)) return
            onClose()
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        const handleReflow = () => {
            updatePosition()
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', handleReflow)
        window.addEventListener('scroll', handleReflow, true)

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', handleReflow)
            window.removeEventListener('scroll', handleReflow, true)
        }
    }, [isOpen, onClose, updatePosition])

    useEffect(() => {
        if (!isOpen) return

        const frame = window.requestAnimationFrame(() => {
            const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
            firstItem?.focus()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen])

    if (!isOpen) return null

    const menuStyle: CSSProperties | undefined = menuPosition
        ? {
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            transformOrigin: menuPosition.transformOrigin,
            zIndex: 200
        }
        : { position: 'fixed', visibility: 'hidden', zIndex: 200 }

    return (
        <div
            ref={menuRef}
            id={resolvedMenuId}
            role="menu"
            aria-label={t('session.more')}
            className="context-menu"
            style={menuStyle}
        >
            <button type="button" role="menuitem" className="menu-action" onClick={handleRename}>
                {t('session.action.rename')}
            </button>

            {onSpawnSameConfig ? (
                <button type="button" role="menuitem" className="menu-action" onClick={handleSpawnSameConfig}>
                    {t('session.action.newSameConfig')}
                </button>
            ) : null}

            {onDuplicate ? (
                <button type="button" role="menuitem" className="menu-action" onClick={handleDuplicate}>
                    {t('session.action.duplicate')}
                </button>
            ) : null}

            {onSaveCheckpoint ? (
                <button type="button" role="menuitem" className="menu-action" onClick={handleSaveCheckpoint}>
                    Save checkpoint
                </button>
            ) : null}

            {onPushCredentials ? (
                <button
                    type="button"
                    role="menuitem"
                    className="menu-action"
                    onClick={handlePushCredentials}
                    disabled={pushCredentialsPending}
                >
                    {pushCredentialsPending ? 'Pushing credentials…' : 'Push host credentials'}
                </button>
            ) : null}

            <div className="menu-divider" role="separator" aria-hidden="true" />

            {sessionActive ? (
                <button type="button" role="menuitem" className="menu-action danger" onClick={handleArchive}>
                    {t('session.action.archive')}
                </button>
            ) : (
                <button type="button" role="menuitem" className="menu-action danger" onClick={handleDelete}>
                    {t('session.action.delete')}
                </button>
            )}
        </div>
    )
}
