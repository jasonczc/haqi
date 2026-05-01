import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
    'ui-btn-base inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-[var(--app-button)] text-[var(--app-button-text)] hover:opacity-90',
                primary: 'bg-[var(--cursor-info,#2563eb)] text-white shadow-sm hover:brightness-110',
                secondary: 'bg-[var(--app-secondary-bg)] text-[var(--app-fg)] hover:opacity-90',
                outline: 'border border-[var(--app-border)] bg-transparent hover:bg-[var(--app-subtle-bg)]',
                ghost: 'bg-transparent text-[var(--cursor-text-secondary)] hover:bg-[var(--cursor-bg-quaternary)] hover:text-[var(--cursor-text-primary)]',
                destructive: 'bg-red-600 text-white hover:bg-red-600/90',
                danger: 'border bg-transparent text-[var(--cursor-danger,#dc2626)] border-[color-mix(in_srgb,var(--cursor-danger,#dc2626)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--cursor-danger,#dc2626)_10%,transparent)]',
                success: 'border font-semibold bg-[color-mix(in_srgb,var(--cursor-success,#16a34a)_8%,transparent)] text-[var(--cursor-success,#16a34a)] border-[color-mix(in_srgb,var(--cursor-success,#16a34a)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--cursor-success,#16a34a)_14%,transparent)]'
            },
            size: {
                default: 'h-9 px-4 py-2',
                xs: 'h-[26px] rounded-md px-2 text-[12.5px] gap-1',
                sm: 'h-8 rounded-md px-3',
                md: 'h-[30px] rounded-[7px] px-3 text-[13px]',
                lg: 'h-10 rounded-md px-8'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean
    leadingIcon?: React.ReactNode
    trailingIcon?: React.ReactNode
    iconOnly?: boolean
}

const ICON_ONLY_SIZE_CLASS: Record<NonNullable<VariantProps<typeof buttonVariants>['size']>, string> = {
    default: 'w-9 !px-0',
    xs: 'w-[26px] !px-0',
    sm: 'w-8 !px-0',
    md: 'w-[30px] !px-0',
    lg: 'w-10 !px-0',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, leadingIcon, trailingIcon, iconOnly, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        const iconOnlyClass = iconOnly ? ICON_ONLY_SIZE_CLASS[size ?? 'default'] : undefined
        const composed = cn(buttonVariants({ variant, size }), iconOnlyClass, className)
        if (asChild) {
            return (
                <Comp className={composed} ref={ref} {...props}>
                    {children}
                </Comp>
            )
        }
        return (
            <Comp
                className={composed}
                ref={ref}
                {...props}
            >
                {leadingIcon ? <span className="inline-flex shrink-0 items-center">{leadingIcon}</span> : null}
                {children}
                {trailingIcon ? <span className="inline-flex shrink-0 items-center">{trailingIcon}</span> : null}
            </Comp>
        )
    }
)
Button.displayName = 'Button'

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
