import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const toastVariants = cva(
    'pointer-events-auto w-full max-w-sm rounded-[10px] border text-[var(--text-primary)] shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)] animate-slide-up transition-colors',
    {
        variants: {
            variant: {
                default: 'border-[var(--border-secondary)] bg-[var(--bg-editor)]',
                success: 'border-[var(--cursor-success-border,rgba(34,197,94,0.24))] bg-[var(--cursor-success-bg,rgba(34,197,94,0.08))]',
                error: 'border-[var(--cursor-danger-border,rgba(220,38,38,0.24))] bg-[var(--cursor-danger-bg,rgba(220,38,38,0.08))]',
                warning: 'border-[var(--cursor-warning-border,rgba(251,191,36,0.26))] bg-[var(--cursor-warning-bg,rgba(251,191,36,0.08))]'
            }
        },
        defaultVariants: {
            variant: 'default'
        }
    }
)

export type ToastProps = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof toastVariants> & {
    title: string
    body: string
    onClose?: () => void
}

export function Toast({ title, body, onClose, className, variant, ...props }: ToastProps) {
    const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onClose?.()
    }

    return (
        <div className={cn(toastVariants({ variant }), className)} role="status" {...props}>
            <div className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-5">{title}</div>
                    <div className="mt-1 text-xs text-[var(--text-tertiary)]">{body}</div>
                </div>
                {onClose ? (
                    <button
                        type="button"
                        className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                        onClick={handleClose}
                        aria-label="Dismiss"
                    >
                        x
                    </button>
                ) : null}
            </div>
        </div>
    )
}
