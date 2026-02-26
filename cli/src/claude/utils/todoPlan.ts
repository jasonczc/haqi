type PlanStatus = 'pending' | 'in_progress' | 'completed';

export type TodoWritePlanEntry = {
    step: string;
    status: PlanStatus;
};

export type TodoWritePlanUpdate = {
    explanation?: string;
    plan: TodoWritePlanEntry[];
};

function normalizePlanStatus(value: unknown): PlanStatus {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'completed' || normalized === 'done') {
        return 'completed';
    }
    if (normalized === 'in_progress' || normalized === 'inprogress' || normalized === 'running') {
        return 'in_progress';
    }
    return 'pending';
}

export function parseTodoWritePlanUpdate(input: unknown): TodoWritePlanUpdate | null {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const value = input as Record<string, unknown>;
    const todosValue = value.todos;
    if (!Array.isArray(todosValue)) {
        return null;
    }

    const plan: TodoWritePlanEntry[] = todosValue
        .map((todo) => {
            if (!todo || typeof todo !== 'object') return null;
            const record = todo as Record<string, unknown>;
            const rawStep = typeof record.content === 'string'
                ? record.content
                : typeof record.step === 'string'
                    ? record.step
                    : '';
            const step = rawStep.trim();
            if (!step) {
                return null;
            }
            return {
                step,
                status: normalizePlanStatus(record.status)
            };
        })
        .filter((entry): entry is TodoWritePlanEntry => entry !== null);

    if (plan.length === 0) {
        return null;
    }

    const rawExplanation = typeof value.explanation === 'string'
        ? value.explanation.trim()
        : '';
    return rawExplanation
        ? { explanation: rawExplanation, plan }
        : { plan };
}
