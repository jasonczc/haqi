import * as React from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const headerTitleClass = 'text-[16px] leading-6 font-semibold text-[var(--cursor-text-primary)]'
const headerSubtitleClass = 'text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]'

const buttonVariants = cva(
    'settings-btn-outline disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                primary: '',
                outline: '',
                neutral: '',
                danger: '!border-[var(--cursor-danger-border)] !bg-[var(--cursor-danger-bg)] !text-[var(--cursor-danger)]',
            },
            size: {
                sm: '!py-1 !px-3',
                md: '',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md',
        },
    }
)

export function cursorButtonClassName(
    options?: VariantProps<typeof buttonVariants> & { className?: string }
): string {
    const { className, ...variants } = options ?? {}
    return cn(buttonVariants(variants), className)
}

export function CursorSettingsHeader(props: {
    title: string
    description: string
}) {
    return (
        <div className="mb-6 flex flex-col gap-1.5">
            <h1 className={headerTitleClass}>{props.title}</h1>
            <p className={headerSubtitleClass}>{props.description}</p>
        </div>
    )
}

export function CursorSettingsSection(props: {
    title?: React.ReactNode
    subtitle?: React.ReactNode
    action?: React.ReactNode
    className?: string
    children: React.ReactNode
}) {
    return (
        <section className={cn('mb-6', props.className)}>
            {(props.title || props.subtitle || props.action) ? (
                <div className="mb-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        {props.title ? (
                            <div className="text-[13px] leading-[18px] font-semibold text-[var(--cursor-text-primary)]">
                                {props.title}
                            </div>
                        ) : null}
                        {props.subtitle ? (
                            <div className="mt-1 text-[12px] leading-4 text-[var(--cursor-text-secondary)]">
                                {props.subtitle}
                            </div>
                        ) : null}
                    </div>
                    {props.action ? <div className="shrink-0">{props.action}</div> : null}
                </div>
            ) : null}
            {props.children}
        </section>
    )
}

export function CursorSettingsCard(props: {
    className?: string
    children: React.ReactNode
}) {
    return (
        <div className={cn('settings-card', props.className)}>
            {props.children}
        </div>
    )
}

export function CursorDialogShell(props: {
    className?: string
    children: React.ReactNode
}) {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-xl border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] shadow-[0_16px_64px_var(--shadow-tertiary)]',
                props.className
            )}
        >
            {props.children}
        </div>
    )
}

export function CursorDialogHeader(props: {
    title: React.ReactNode
    description?: React.ReactNode
    className?: string
    action?: React.ReactNode
}) {
    return (
        <div className={cn('flex items-start justify-between gap-4 border-b border-[var(--cursor-stroke-tertiary)] px-5 py-4', props.className)}>
            <div className="min-w-0">
                <div className="text-[15px] font-semibold leading-6 text-[var(--cursor-text-primary)]">{props.title}</div>
                {props.description ? (
                    <div className="mt-1 text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">{props.description}</div>
                ) : null}
            </div>
            {props.action ? <div className="shrink-0">{props.action}</div> : null}
        </div>
    )
}

export function CursorDialogBody(props: {
    className?: string
    children: React.ReactNode
}) {
    return <div className={cn('flex flex-col gap-4 px-5 py-5', props.className)}>{props.children}</div>
}

export function CursorDialogFooter(props: {
    className?: string
    children: React.ReactNode
}) {
    return (
        <div className={cn('flex items-center justify-end gap-2 border-t border-[var(--cursor-stroke-tertiary)] pt-4', props.className)}>
            {props.children}
        </div>
    )
}

export function CursorSettingsRow(props: {
    title?: React.ReactNode
    description?: React.ReactNode
    control?: React.ReactNode
    noBorder?: boolean
    alignTop?: boolean
    className?: string
    children?: React.ReactNode
}) {
    return (
        <div
            className={cn(
                'settings-row',
                props.alignTop ? 'items-start' : '',
                props.noBorder ? 'settings-row-nobottom' : '',
                props.className
            )}
        >
            {props.children ?? (
                <>
                    <div className="settings-row-left" style={{ flex: 1 }}>
                        {props.title ? (
                            <div className="settings-row-title">{props.title}</div>
                        ) : null}
                        {props.description ? (
                            <div className="settings-row-desc">{props.description}</div>
                        ) : null}
                    </div>
                    {props.control ? (
                        <div className="settings-row-right">{props.control}</div>
                    ) : null}
                </>
            )}
        </div>
    )
}

export function CursorFieldLabel(props: {
    children: React.ReactNode
    htmlFor?: string
    action?: React.ReactNode
    className?: string
}) {
    const label = (
        <span className={cn('text-[12px] leading-4 font-medium text-[var(--cursor-text-secondary)]', props.className)}>
            {props.children}
        </span>
    )

    if (props.action) {
        return (
            <div className="flex items-center justify-between gap-2">
                {props.htmlFor ? <label htmlFor={props.htmlFor}>{label}</label> : label}
                <div className="shrink-0">{props.action}</div>
            </div>
        )
    }

    return props.htmlFor ? <label htmlFor={props.htmlFor}>{label}</label> : label
}

export function CursorFieldHint(props: {
    children: React.ReactNode
    tone?: 'default' | 'danger' | 'accent'
    className?: string
}) {
    const toneClass = props.tone === 'danger'
        ? 'text-[var(--danger)]'
        : props.tone === 'accent'
            ? 'text-[var(--accent)]'
            : 'text-[var(--cursor-text-secondary)]'
    return (
        <div className={cn('pt-1 text-[11px] leading-4', toneClass, props.className)}>
            {props.children}
        </div>
    )
}

export function CursorNotice(props: {
    children: React.ReactNode
    tone?: 'accent' | 'danger'
    className?: string
}) {
    const toneClass = props.tone === 'danger'
        ? 'border-[var(--border-danger)] bg-[var(--bg-danger-quaternary)] text-[var(--danger)]'
        : 'border-[var(--border-accent)] bg-[var(--bg-accent-tertiary)] text-[var(--accent)]'
    return (
        <div className={cn('rounded-md border px-3 py-2 text-[12px] leading-4', toneClass, props.className)}>
            {props.children}
        </div>
    )
}

export function CursorSettingsBadge(props: {
    children: React.ReactNode
    tone?: 'default' | 'success' | 'danger' | 'accent'
    className?: string
    title?: string
}) {
    const toneClass = props.tone === 'success'
        ? 'bg-[var(--bg-success-quaternary)] text-[var(--success)]'
        : props.tone === 'danger'
            ? 'bg-[var(--bg-danger-quaternary)] text-[var(--danger)]'
            : props.tone === 'accent'
                ? 'bg-[var(--bg-accent-tertiary)] text-[var(--accent)]'
                : 'bg-[var(--cursor-bg-hover)] text-[var(--cursor-text-secondary)]'
    return (
        <span
            title={props.title}
            className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] leading-[14px] font-semibold', toneClass, props.className)}
        >
            {props.children}
        </span>
    )
}

export function CursorBadgeButton(props: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    title?: string
    className?: string
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            disabled={props.disabled}
            title={props.title}
            className={cn('max-w-full disabled:opacity-50', props.className)}
        >
            <CursorSettingsBadge className="max-w-full cursor-pointer truncate rounded-full transition-colors hover:bg-[var(--cursor-bg-hover)]">
                {props.children}
            </CursorSettingsBadge>
        </button>
    )
}

export function CursorCodeBlock(props: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <code
            className={cn(
                'flex-1 break-all rounded-md border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-card)] px-3 py-2 font-[var(--font-mono)] text-[12px] leading-4 text-[var(--cursor-text-primary)]',
                props.className
            )}
        >
            {props.children}
        </code>
    )
}

export function CursorInlineCode(props: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <code className={cn('font-[var(--font-mono)] text-[12px] leading-4 text-[var(--cursor-text-secondary)]', props.className)}>
            {props.children}
        </code>
    )
}

export function CursorTextLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    const { className, ...rest } = props
    return (
        <a
            className={cn(
                'text-[11px] text-[var(--accent)] transition-colors hover:underline',
                className
            )}
            {...rest}
        />
    )
}

export function CursorEmptyState(props: {
    title: string
    description: string
    action?: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-card)] px-4 py-12 text-center',
            props.className
        )}
        >
            <div className="text-[13px] leading-[18px] font-semibold text-[var(--cursor-text-primary)]">{props.title}</div>
            <div className="max-w-[34rem] text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">{props.description}</div>
            {props.action ? props.action : null}
        </div>
    )
}

export function CursorButton(
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>
) {
    const { className, variant, size, ...rest } = props
    return <button className={cn(buttonVariants({ variant, size }), className)} {...rest} />
}

export function CursorLinkButton(
    props: LinkProps & VariantProps<typeof buttonVariants> & { className?: string }
) {
    const { className, variant, size, ...rest } = props
    return <Link className={cn(buttonVariants({ variant, size }), className)} {...rest} />
}

export function CursorIconButton(
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
        variant?: VariantProps<typeof buttonVariants>['variant']
        size?: 'sm' | 'md'
    }
) {
    const { className, variant = 'primary', size = 'md', ...rest } = props
    return (
        <button
            className={cn(
                buttonVariants({ variant, size: 'md' }),
                'aspect-square px-0',
                size === 'sm' ? 'h-8 w-8 rounded-md' : 'h-9 w-9 rounded-full',
                className
            )}
            {...rest}
        />
    )
}

export const CursorTextField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; compact?: boolean }>(
    function CursorTextField(props, ref) {
        const { className, mono, compact, ...rest } = props
        return (
            <input
                ref={ref}
                className={cn(
                    'w-full rounded-md border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] text-[13px] leading-[18px] text-[var(--cursor-text-primary)] placeholder:text-[var(--cursor-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50',
                    compact ? 'h-8 px-3 py-1.5' : 'h-9 px-3 py-2',
                    mono ? 'font-[var(--font-mono)]' : '',
                    className
                )}
                {...rest}
            />
        )
    }
)

export function CursorTextArea(
    props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
    const { className, ...rest } = props
    return (
        <textarea
            className={cn(
                'w-full rounded-md border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] px-3 py-2 text-[13px] leading-[18px] text-[var(--cursor-text-primary)] placeholder:text-[var(--cursor-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50',
                className
            )}
            {...rest}
        />
    )
}

export function CursorSelect(
    props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
    const { className, children, ...rest } = props
    return (
        <div className={cn(
            'relative min-w-[200px] rounded-md border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] text-[13px] leading-[18px] text-[var(--cursor-text-primary)] transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]',
            className
        )}
        >
            <select
                className="h-9 w-full appearance-none bg-transparent px-3 pr-8 text-[13px] leading-[18px] text-[var(--cursor-text-primary)] focus:outline-none disabled:opacity-50"
                {...rest}
            >
                {children}
            </select>
            <svg
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cursor-text-tertiary)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <polyline points="6 9 12 15 18 9" />
            </svg>
        </div>
    )
}

export function CursorSelectButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const { className, children, ...rest } = props
    return (
        <button
            className={cn(
                'inline-flex min-w-[200px] items-center justify-between gap-2 rounded-md border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] px-3 py-2 text-[13px] leading-[18px] text-[var(--cursor-text-primary)] transition-colors hover:bg-[var(--cursor-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                className
            )}
            {...rest}
        >
            <span className="truncate">{children}</span>
            <svg
                className="h-3.5 w-3.5 shrink-0 text-[var(--cursor-text-tertiary)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <polyline points="6 9 12 15 18 9" />
            </svg>
        </button>
    )
}

export const CursorSearchField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }>(
    function CursorSearchField(props, ref) {
        const { className, compact, ...rest } = props
        return (
            <div className={cn(
                'flex items-center gap-2 rounded-md border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] text-[var(--cursor-text-primary)] transition-colors focus-within:border-[var(--cursor-stroke-primary)] focus-within:ring-2 focus-within:ring-[var(--accent)] hover:border-[var(--cursor-stroke-primary)]',
                compact ? 'px-2 py-1.5' : 'px-3 py-2',
                className
            )}
            >
                <svg
                    className="h-3.5 w-3.5 shrink-0 text-[var(--cursor-text-tertiary)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    ref={ref}
                    className="w-full bg-transparent text-[13px] leading-[18px] text-[var(--cursor-text-primary)] placeholder:text-[var(--cursor-text-tertiary)] focus:outline-none"
                    {...rest}
                />
            </div>
        )
    }
)

export function CursorToggle(props: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={props.checked}
            disabled={props.disabled}
            onClick={() => props.onCheckedChange(!props.checked)}
            className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50',
                props.checked
                    ? 'border-[var(--border-success)] bg-[var(--success)]'
                    : 'border-[var(--cursor-stroke-secondary)] bg-[var(--bg-secondary)]'
            )}
        >
            <span
                className={cn(
                    'absolute top-[1px] h-4 w-4 rounded-full bg-[var(--cursor-bg-card)] shadow-[0_1px_2px_var(--shadow-primary)] transition-transform',
                    props.checked ? 'translate-x-[18px]' : 'translate-x-[1px]'
                )}
            />
        </button>
    )
}

export function CursorToggleRow(props: {
    label: React.ReactNode
    description?: React.ReactNode
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
    className?: string
}) {
    return (
        <label className={cn('flex items-center justify-between gap-3 rounded-md border border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-hover)] px-3 py-2', props.className)}>
            <div className="flex min-w-0 flex-col">
                <span className="text-[13px] leading-[18px] text-[var(--cursor-text-primary)]">{props.label}</span>
                {props.description ? (
                    <span className="text-[12px] leading-4 text-[var(--cursor-text-secondary)]">{props.description}</span>
                ) : null}
            </div>
            <CursorToggle
                checked={props.checked}
                onCheckedChange={props.onCheckedChange}
                disabled={props.disabled}
            />
        </label>
    )
}

export function CursorChoiceRow(props: {
    name: string
    value: string
    checked: boolean
    onChange: () => void
    disabled?: boolean
    label: React.ReactNode
    description?: React.ReactNode
    className?: string
    controlClassName?: string
}) {
    return (
        <label className={cn('flex min-h-[34px] items-center gap-2 cursor-pointer', props.className)}>
            <CursorRadio
                name={props.name}
                value={props.value}
                checked={props.checked}
                onChange={props.onChange}
                disabled={props.disabled}
            />
            <div className={cn('flex min-w-0 items-center gap-2', props.controlClassName)}>
                <span className="text-[13px] leading-[18px] text-[var(--cursor-text-primary)]">{props.label}</span>
                {props.description ? (
                    <span className="text-[12px] leading-4 text-[var(--cursor-text-secondary)]">{props.description}</span>
                ) : null}
            </div>
        </label>
    )
}

export const CursorRadio = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    function CursorRadio(props, ref) {
        const { className, ...rest } = props
        return (
            <input
                ref={ref}
                type="radio"
                className={cn('h-4 w-4 accent-[var(--accent)]', className)}
                {...rest}
            />
        )
    }
)

export function CursorTabButton(props: {
    active: boolean
    onClick?: () => void
    children: React.ReactNode
    className?: string
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={cn(
                'relative inline-flex h-9 items-center border-b-2 px-0 text-[13px] font-medium transition-colors',
                props.active
                    ? 'border-[var(--cursor-text-primary)] text-[var(--cursor-text-primary)]'
                    : 'border-transparent text-[var(--cursor-text-secondary)] hover:text-[var(--cursor-text-primary)]',
                props.className
            )}
        >
            {props.children}
        </button>
    )
}

export function CursorExpandableRow(props: {
    title: React.ReactNode
    description?: React.ReactNode
    children: React.ReactNode
    defaultOpen?: boolean
}) {
    const [open, setOpen] = React.useState(Boolean(props.defaultOpen))
    return (
        <div className="border-b border-[var(--cursor-stroke-tertiary)] last:border-b-0">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--cursor-bg-hover)]"
            >
                <div className="min-w-0">
                    <div className="text-[13px] leading-[18px] font-semibold text-[var(--cursor-text-primary)]">{props.title}</div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                    {props.description ? (
                        <div className="truncate text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">
                            {props.description}
                        </div>
                    ) : null}
                    <svg
                        className={cn('h-3.5 w-3.5 shrink-0 text-[var(--cursor-text-tertiary)] transition-transform', open ? 'rotate-90' : '')}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </div>
            </button>
            {open ? (
                <div className="border-t border-[var(--cursor-stroke-tertiary)] bg-[var(--cursor-bg-hover)] px-4 py-4">
                    {props.children}
                </div>
            ) : null}
        </div>
    )
}

export function CursorCollapsibleSection(props: {
    title: React.ReactNode
    description?: React.ReactNode
    isExpanded: boolean
    onToggle: () => void
    children: React.ReactNode
    className?: string
}) {
    const sectionContentId = React.useId()
    return (
        <CursorSettingsCard className={props.className}>
            <CursorSettingsRow noBorder alignTop className="px-0 py-0">
                <button
                    type="button"
                    onClick={props.onToggle}
                    className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--cursor-bg-hover)]"
                    aria-expanded={props.isExpanded}
                    aria-controls={sectionContentId}
                >
                    <div className="flex min-w-0 flex-col">
                        <span className="text-[13px] leading-[18px] font-semibold text-[var(--cursor-text-primary)]">{props.title}</span>
                        {props.description ? (
                            <span className="mt-1 text-[13px] leading-[18px] text-[var(--cursor-text-secondary)]">{props.description}</span>
                        ) : null}
                    </div>
                    <svg
                        className={cn(
                            'mt-0.5 h-4 w-4 shrink-0 text-[var(--cursor-text-tertiary)] transition-transform',
                            props.isExpanded ? 'rotate-180' : ''
                        )}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
            </CursorSettingsRow>
            {props.isExpanded ? (
                <div id={sectionContentId}>{props.children}</div>
            ) : null}
        </CursorSettingsCard>
    )
}

export function CursorDetailGrid(props: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <CursorSettingsCard className={cn('grid gap-3 border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-card)] p-4 text-sm md:grid-cols-2', props.className)}>
            {props.children}
        </CursorSettingsCard>
    )
}

export function CursorDetailItem(props: {
    label: React.ReactNode
    value: React.ReactNode
    className?: string
}) {
    return (
        <div className={props.className}>
            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--cursor-text-secondary)]">{props.label}</div>
            <div className="mt-1 font-medium">{props.value}</div>
        </div>
    )
}
