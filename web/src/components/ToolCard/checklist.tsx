import { isObject } from '@hapi/protocol'
import { ChecklistStatusIcon } from '@/components/ui/ChecklistStatusIcon'

export type ChecklistStatus = 'pending' | 'in_progress' | 'completed'

export type ChecklistItem = {
    id?: string
    text: string
    status: ChecklistStatus
}

function normalizeChecklistStatus(value: unknown): ChecklistStatus {
    if (value === 'completed') return 'completed'
    if (value === 'in_progress') return 'in_progress'
    return 'pending'
}

function parseChecklistEntries(
    entries: unknown,
    opts: {
        textKey: 'content' | 'step'
        idKey?: string
    }
): ChecklistItem[] {
    if (!Array.isArray(entries)) return []

    const items: ChecklistItem[] = []
    for (const entry of entries) {
        if (!isObject(entry)) continue

        const text = entry[opts.textKey]
        if (typeof text !== 'string') continue

        const idValue = opts.idKey ? entry[opts.idKey] : undefined
        items.push({
            id: typeof idValue === 'string' ? idValue : undefined,
            text,
            status: normalizeChecklistStatus(entry.status)
        })
    }

    return items
}

export function extractTodoChecklist(input: unknown, result: unknown): ChecklistItem[] {
    if (isObject(input) && Array.isArray(input.todos)) {
        const items = parseChecklistEntries(input.todos, {
            textKey: 'content',
            idKey: 'id'
        })
        if (items.length > 0) return items
    }

    if (isObject(result) && Array.isArray(result.newTodos)) {
        return parseChecklistEntries(result.newTodos, {
            textKey: 'content',
            idKey: 'id'
        })
    }

    return []
}

export function extractUpdatePlanChecklist(input: unknown, result: unknown): ChecklistItem[] {
    if (isObject(input) && Object.prototype.hasOwnProperty.call(input, 'plan')) {
        return parseChecklistEntries(input.plan, {
            textKey: 'step'
        })
    }

    if (isObject(result)) {
        return parseChecklistEntries(result.plan, {
            textKey: 'step'
        })
    }

    return []
}

function checklistTextTone(status: ChecklistStatus): string {
    if (status === 'completed') return 'text-[var(--cursor-text-tertiary)] line-through'
    if (status === 'in_progress') return 'text-[var(--cursor-text-primary)]'
    return 'text-[var(--cursor-text-secondary)]'
}

export function ChecklistList(props: { items: ChecklistItem[]; emptyLabel?: string | null }) {
    if (props.items.length === 0) {
        return props.emptyLabel ? (
            <div className="text-sm text-[var(--cursor-text-secondary)]">{props.emptyLabel}</div>
        ) : null
    }

    return (
        <div className="flex flex-col gap-1.5">
            {props.items.map((item, idx) => {
                const text = item.text.trim().length > 0 ? item.text.trim() : '(empty)'
                return (
                    <div
                        key={item.id ?? String(idx)}
                        data-status={item.status}
                        className="checklist-item-transition flex items-start gap-2 text-[13px] leading-[1.5]"
                    >
                        <span className="checklist-item-icon mt-[2px]">
                            <ChecklistStatusIcon status={item.status} />
                        </span>
                        <span className={`checklist-item-text flex-1 min-w-0 ${checklistTextTone(item.status)}`}>{text}</span>
                    </div>
                )
            })}
        </div>
    )
}
