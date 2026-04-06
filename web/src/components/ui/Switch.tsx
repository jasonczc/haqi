import { cn } from '@/lib/utils'

type SwitchProps = {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
    className?: string
    ariaLabel?: string
}

export function Switch(props: SwitchProps) {
    const { checked, onCheckedChange, disabled = false, className, ariaLabel } = props

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-0 p-0 appearance-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                checked ? 'bg-[var(--success)]' : 'bg-[var(--border-secondary)]',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                className
            )}
        >
            <span
                className={cn(
                    'h-4 w-4 rounded-full bg-white transition-transform',
                    checked ? 'translate-x-4' : 'translate-x-0.5'
                )}
            />
        </button>
    )
}
