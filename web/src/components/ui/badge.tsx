import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
    {
        variants: {
            variant: {
                default: 'border-[var(--border-secondary)] bg-[var(--bg-quaternary)] text-[var(--text-primary)]',
                warning: 'border-[var(--warn)]/20 bg-[var(--warn)]/10 text-[var(--warn)]',
                success: 'border-[var(--success)]/20 bg-[var(--success)]/10 text-[var(--success)]',
                destructive: 'border-[var(--danger)]/20 bg-[var(--danger)]/10 text-[var(--danger)]'
            }
        },
        defaultVariants: {
            variant: 'default'
        }
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
