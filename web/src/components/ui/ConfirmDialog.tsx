import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'

type ConfirmDialogProps = {
    isOpen: boolean
    onClose: () => void
    title: string
    description: string
    confirmLabel: string
    confirmingLabel: string
    onConfirm: () => Promise<void>
    isPending: boolean
    destructive?: boolean
}

export function ConfirmDialog(props: ConfirmDialogProps) {
    const { t } = useTranslation()
    const {
        isOpen,
        onClose,
        title,
        description,
        confirmLabel,
        confirmingLabel,
        onConfirm,
        isPending,
        destructive = false
    } = props

    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen) setError(null)
    }, [isOpen])

    const handleConfirm = async () => {
        setError(null)
        try {
            await onConfirm()
            onClose()
        } catch (err) {
            const message =
                err instanceof Error && err.message
                    ? err.message
                    : t('dialog.error.default')
            setError(message)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="cc-dialog cc-confirm max-w-sm">
                <DialogHeader>
                    <DialogTitle className="cc-dialog-title">{title}</DialogTitle>
                    <DialogDescription className="cc-dialog-desc">{description}</DialogDescription>
                </DialogHeader>

                {error ? (
                    <div className="cc-confirm-error" role="alert">
                        {error}
                    </div>
                ) : null}

                <div className="cc-confirm-actions">
                    <button
                        type="button"
                        className="cc-btn cc-btn-ghost"
                        onClick={onClose}
                        disabled={isPending}
                    >
                        {t('button.cancel')}
                    </button>
                    <button
                        type="button"
                        className={destructive ? 'cc-btn cc-btn-danger' : 'cc-btn cc-btn-primary'}
                        onClick={handleConfirm}
                        disabled={isPending}
                    >
                        {isPending ? confirmingLabel : confirmLabel}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
