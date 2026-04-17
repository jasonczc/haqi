import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * App-wide button primitive. Variants map to the Cursor-style design system:
 *   - default:     filled dark (strong emphasis)
 *   - primary:     filled accent blue (main CTAs)
 *   - secondary:   neutral card bg with border (default action)
 *   - outline:     bordered transparent (legacy)
 *   - ghost:       transparent, hover bg (inline / toolbar)
 *   - destructive: filled red (dangerous CTA)
 *   - danger:      bordered red (cautious destructive)
 *   - success:     bordered green (approve actions)
 *
 * All variants share:
 *   - motion token transitions (see --motion-fast / --motion-ease-out)
 *   - :active scale(0.97) press feedback
 *   - focus-visible blue ring (theme)
 *   - disabled at 50% opacity
 */
const buttonVariants = cva(
    'ui-btn-base inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cursor-info,#2563eb)] focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-[var(--bg-neutral)] text-[var(--bg-editor)] shadow-sm hover:brightness-110 hover:shadow active:brightness-95 active:shadow-none',
                primary: 'bg-[var(--cursor-info,#2563eb)] text-white shadow-sm hover:brightness-110 hover:shadow active:brightness-95 active:shadow-none',
                secondary: 'border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] text-[var(--cursor-text-primary)] hover:bg-[var(--cursor-bg-quaternary)] hover:border-[var(--cursor-stroke-primary)]',
                outline: 'border border-[var(--border-secondary)] bg-transparent text-[var(--cursor-text-primary)] hover:bg-[var(--cursor-bg-quaternary)]',
                ghost: 'bg-transparent text-[var(--cursor-text-secondary)] hover:bg-[var(--cursor-bg-quaternary)] hover:text-[var(--cursor-text-primary)]',
                destructive: 'bg-[var(--cursor-danger,#dc2626)] text-white shadow-sm hover:brightness-110 hover:shadow active:brightness-95',
                danger: 'border bg-transparent text-[var(--cursor-danger,#dc2626)] border-[color-mix(in_srgb,var(--cursor-danger,#dc2626)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--cursor-danger,#dc2626)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--cursor-danger,#dc2626)_36%,transparent)]',
                success: 'border font-semibold bg-[color-mix(in_srgb,var(--cursor-success,#16a34a)_8%,transparent)] text-[var(--cursor-success,#16a34a)] border-[color-mix(in_srgb,var(--cursor-success,#16a34a)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--cursor-success,#16a34a)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--cursor-success,#16a34a)_36%,transparent)]'
            },
            size: {
                default: 'h-9 px-4 py-2',
                xs: 'h-[26px] rounded-md px-2 text-[12.5px] gap-1',
                sm: 'h-8 rounded-md px-3 text-[12px]',
                md: 'h-[30px] rounded-[7px] px-3 text-[13px]',
                lg: 'h-10 rounded-md px-6'
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
    /** Renders as a square icon-only button (strips horizontal padding, matches height). */
    iconOnly?: boolean
}

/** Tailwind class that squares the button and removes horizontal padding per size. */
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
            <Comp className={composed} ref={ref} {...props}>
                {leadingIcon ? <span className="inline-flex shrink-0 items-center">{leadingIcon}</span> : null}
                {children}
                {trailingIcon ? <span className="inline-flex shrink-0 items-center">{trailingIcon}</span> : null}
            </Comp>
        )
    }
)
Button.displayName = 'Button'

/** Re-export variant type for callers needing to pick one dynamically. */
export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
