import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import { withSwarmAutomationLock } from '../../sync/swarmAutomationLock'
import type { WebAppEnv } from '../middleware/auth'
import type { SyncEngine } from '../../sync/syncEngine'
import { requireSyncEngine } from './guards'

const createSwarmSchema = z.object({
    title: z.string().trim().min(1).max(255),
    createdBy: z.string().trim().max(255).optional(),
    status: z.string().trim().min(1).max(120).optional(),
    currentPhase: z.string().trim().min(1).max(120).optional(),
    subject: z.object({
        kind: z.string().trim().min(1).max(120).optional(),
        summary: z.string(),
        successCriteria: z.string().optional().nullable(),
        constraints: z.unknown().optional(),
        status: z.string().trim().min(1).max(120).optional()
    }).optional()
})

const updateSwarmSchema = z.object({
    title: z.string().trim().min(1).max(255).optional(),
    status: z.string().trim().min(1).max(120).optional(),
    currentPhase: z.string().trim().min(1).max(120).optional()
})

const updateSubjectSchema = z.object({
    kind: z.string().trim().min(1).max(120).optional(),
    summary: z.string().optional(),
    successCriteria: z.string().nullable().optional(),
    constraints: z.unknown().optional(),
    status: z.string().trim().min(1).max(120).optional()
})

const addParticipantSchema = z.object({
    kind: z.enum(['human', 'agent', 'service']),
    refId: z.string().trim().min(1).max(255).optional(),
    provider: z.string().trim().min(1).max(255).optional(),
    model: z.string().trim().min(1).max(255).optional(),
    capabilities: z.array(z.string().trim().min(1).max(255)).optional(),
    availability: z.string().trim().min(1).max(120).optional()
})

const addOutcomeSchema = z.object({
    subjectId: z.string().trim().min(1).max(255).optional(),
    workItemId: z.string().trim().min(1).max(255).optional(),
    kind: z.string().trim().min(1).max(120),
    status: z.string().trim().min(1).max(120).optional(),
    createdByParticipantId: z.string().trim().min(1).max(255).optional(),
    content: z.unknown().optional(),
    artifactRefs: z.array(z.string().trim().min(1).max(255)).optional()
})

const updateOutcomeSchema = z.object({
    workItemId: z.string().trim().max(255).nullable().optional(),
    status: z.string().trim().min(1).max(120).optional(),
    content: z.unknown().optional(),
    artifactRefs: z.array(z.string().trim().min(1).max(255)).optional()
})

const addArtifactSchema = z.object({
    workItemId: z.string().trim().min(1).max(255).optional(),
    kind: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(255),
    content: z.unknown().optional(),
    url: z.string().trim().min(1).max(4000).optional(),
    status: z.string().trim().min(1).max(120).optional()
})

const addWorkItemSchema = z.object({
    subjectId: z.string().trim().min(1).max(255).optional(),
    title: z.string().trim().min(1).max(255),
    intent: z.string().trim().min(1).max(20_000).optional(),
    status: z.string().trim().min(1).max(120).optional(),
    assignedParticipantId: z.string().trim().min(1).max(255).optional(),
    expectedArtifact: z.string().trim().min(1).max(255).optional(),
    doneCriteria: z.string().trim().min(1).max(4_000).optional()
})

const addActivitySchema = z.object({
    subjectId: z.string().trim().min(1).max(255).optional(),
    workItemId: z.string().trim().min(1).max(255).optional(),
    kind: z.string().trim().min(1).max(120),
    status: z.string().trim().min(1).max(120).optional(),
    participantId: z.string().trim().min(1).max(255).optional(),
    content: z.unknown().optional()
})

const addRoleBindingSchema = z.object({
    participantId: z.string().trim().min(1).max(255),
    role: z.string().trim().min(1).max(120),
    phase: z.string().trim().min(1).max(120).optional(),
    status: z.string().trim().min(1).max(120).optional()
})

const addRoleProfileSchema = z.object({
    role: z.string().trim().min(1).max(120),
    instructionText: z.string().trim().max(20_000).optional().nullable(),
    preferredSkillIds: z.array(z.string().trim().min(1).max(255)).optional().nullable(),
    allowedTools: z.array(z.string().trim().min(1).max(255)).optional().nullable(),
    outputContract: z.string().trim().max(255).optional().nullable()
})

const updateRoleProfileSchema = z.object({
    instructionText: z.string().trim().max(20_000).optional().nullable(),
    preferredSkillIds: z.array(z.string().trim().min(1).max(255)).optional().nullable(),
    allowedTools: z.array(z.string().trim().min(1).max(255)).optional().nullable(),
    outputContract: z.string().trim().max(255).optional().nullable()
})

const addThreadSchema = z.object({
    title: z.string().trim().min(1).max(255),
    kind: z.string().trim().min(1).max(120).optional(),
    status: z.string().trim().min(1).max(120).optional(),
    summary: z.string().trim().max(4_000).optional()
})

const addThreadEntrySchema = z.object({
    threadId: z.string().trim().min(1).max(255),
    kind: z.string().trim().min(1).max(120),
    participantId: z.string().trim().min(1).max(255).optional(),
    replyToEntryId: z.string().trim().min(1).max(255).optional(),
    citesEntryIds: z.array(z.string().trim().min(1).max(255)).optional(),
    content: z.unknown().optional()
})

const addPolicySchema = z.object({
    kind: z.string().trim().min(1).max(120),
    status: z.string().trim().min(1).max(120).optional(),
    config: z.unknown().optional()
})

const updatePolicySchema = z.object({
    status: z.string().trim().min(1).max(120).optional(),
    config: z.unknown().optional()
})

const runPoliciesSchema = z.object({
    force: z.boolean().optional()
})

const addReviewSchema = z.object({
    workItemId: z.string().trim().min(1).max(255).optional(),
    artifactId: z.string().trim().min(1).max(255).optional(),
    status: z.string().trim().min(1).max(120).optional(),
    verdict: z.string().trim().min(1).max(120).nullable().optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
    createdByParticipantId: z.string().trim().min(1).max(255).optional()
})

const updateReviewSchema = z.object({
    status: z.string().trim().min(1).max(120).optional(),
    verdict: z.string().trim().max(120).nullable().optional(),
    summary: z.string().trim().max(4000).nullable().optional()
})

const updateWorkItemSchema = z.object({
    title: z.string().trim().min(1).max(255).optional(),
    intent: z.string().trim().max(20_000).nullable().optional(),
    status: z.string().trim().min(1).max(120).optional(),
    assignedParticipantId: z.string().trim().max(255).nullable().optional(),
    expectedArtifact: z.string().trim().max(255).nullable().optional(),
    doneCriteria: z.string().trim().max(4_000).nullable().optional(),
    lastDispatchAt: z.number().nullable().optional()
})

const addTransitionSchema = z.object({
    entityType: z.string().trim().min(1).max(120),
    entityId: z.string().trim().min(1).max(255),
    fromState: z.string().trim().min(1).max(120).nullable().optional(),
    toState: z.string().trim().min(1).max(120),
    reason: z.string().trim().max(4000).nullable().optional(),
    byParticipantId: z.string().trim().min(1).max(255).optional()
})

const dispatchSchema = z.object({
    participantId: z.string().trim().min(1).max(255).optional(),
    sessionId: z.string().trim().min(1).max(255).optional(),
    workItemId: z.string().trim().min(1).max(255).optional(),
    title: z.string().trim().min(1).max(255).optional(),
    expectedArtifact: z.string().trim().min(1).max(255).optional(),
    doneCriteria: z.string().trim().min(1).max(4_000).optional(),
    text: z.string().trim().min(1).max(20_000)
})

const broadcastSwarmSchema = z.object({
    groupId: z.string().trim().min(1).max(255),
    text: z.string().trim().max(20_000).optional()
})

const createArtifactFromReportSchema = z.object({
    reportId: z.string().trim().min(1).max(255),
    workItemId: z.string().trim().min(1).max(255).optional(),
    title: z.string().trim().min(1).max(255).optional()
})

const autoPlanSchema = z.object({
    dispatch: z.boolean().optional(),
    maxItems: z.number().int().min(1).max(8).optional()
})

const synthesizeThreadSchema = z.object({
    asDecision: z.boolean().optional()
})

const addEffectSchema = z.object({
    workItemId: z.string().trim().min(1).max(255).optional(),
    kind: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(4000).optional(),
    data: z.unknown().optional(),
    raw: z.unknown().optional()
})

function toErrorResponse(c: Context<WebAppEnv>, error: unknown): Response {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (message.toLowerCase().includes('not found')) {
        return c.json({ error: message }, 404)
    }
    return c.json({ error: message }, 400)
}

function getSwarmDetail(store: Store, swarmId: string, namespace: string) {
    const swarm = store.swarms.getSwarmByNamespace(swarmId, namespace)
    if (!swarm) {
        return null
    }
    return {
        swarm,
        subject: store.swarms.getSwarmSubject(swarmId, namespace),
        participants: store.swarms.getSwarmParticipants(swarmId, namespace),
        activities: store.swarms.getSwarmActivities(swarmId, namespace),
        roleBindings: store.swarms.getSwarmRoleBindings(swarmId, namespace),
        roleBindingHistory: store.swarms.getSwarmRoleBindingHistory(swarmId, namespace),
        roleProfiles: store.swarms.getSwarmRoleProfiles(swarmId, namespace).map((profile) => ({
            ...profile,
            instructionText: withSwarmRoleProfileToolGuidance(profile.role, profile.instructionText)
        })),
        threads: store.swarms.getSwarmThreads(swarmId, namespace),
        threadEntries: store.swarms.getSwarmThreadEntries(swarmId, namespace),
        policies: store.swarms.getSwarmPolicies(swarmId, namespace),
        reviews: store.swarms.getSwarmReviews(swarmId, namespace),
        assignments: store.swarms.getSwarmWorkItemAssignments(swarmId, namespace),
        leases: store.swarms.getSwarmParticipantLeases(swarmId, namespace),
        outcomes: store.swarms.getSwarmOutcomes(swarmId, namespace),
        workItems: store.swarms.getSwarmWorkItems(swarmId, namespace),
        artifacts: store.swarms.getSwarmArtifacts(swarmId, namespace),
        transitions: store.swarms.getSwarmTransitions(swarmId, namespace),
        effects: store.swarms.getSwarmEffects(swarmId, namespace),
        events: store.swarms.getSwarmEvents(swarmId, namespace)
    }
}

function withSwarmRoleProfileToolGuidance(role: string, instructionText: string | null | undefined): string | null | undefined {
    const text = instructionText?.trim() ?? ''
    if (!text) {
        return instructionText
    }
    if (role === 'planner' && !text.includes('record_outcome')) {
        return `${text} When you form a proposal, blocker, decision, or summary, call record_outcome.`
    }
    if (role === 'implementer' && !text.includes('record_artifact')) {
        return `${text} Record stage starts/completions with record_activity. Record deliverables with record_artifact. Record blockers with record_outcome.`
    }
    if (role === 'reviewer' && !text.includes('record_review')) {
        return `${text} When you reach a verdict, call record_review.`
    }
    if (role === 'coordinator' && !text.includes('record_activity')) {
        return `${text} Record coordination starts/completions with record_activity and blockers/summaries with record_outcome.`
    }
    return instructionText
}

function maybeAdvanceWorkItem(
    store: Store,
    options: {
        swarmId: string
        namespace: string
        workItemId?: string | null
        toStatus?: string | null
        reason: string
        byParticipantId?: string | null
    }
) {
    if (!options.workItemId || !options.toStatus) {
        return { workItem: null, transition: null }
    }
    const existing = store.swarms.getSwarmWorkItemById(options.swarmId, options.namespace, options.workItemId)
    if (!existing) {
        return { workItem: null, transition: null }
    }
    if (existing.status === options.toStatus) {
        return { workItem: existing, transition: null }
    }
    const workItem = store.swarms.updateSwarmWorkItem({
        swarmId: options.swarmId,
        namespace: options.namespace,
        workItemId: options.workItemId,
        status: options.toStatus
    })
    const transition = workItem
        ? store.swarms.addSwarmTransition({
            swarmId: options.swarmId,
            namespace: options.namespace,
            entityType: 'work_item',
            entityId: workItem.id,
            fromState: existing.status,
            toState: workItem.status,
            reason: options.reason,
            byParticipantId: options.byParticipantId ?? null
        })
        : null
    return { workItem, transition }
}

function deriveWorkItemStatusFromOutcome(kind: string, status: string | undefined): string | null {
    const normalizedKind = kind.trim().toLowerCase()
    const normalizedStatus = status?.trim().toLowerCase()
    if (normalizedKind === 'blocker' || normalizedStatus === 'blocked') {
        return 'blocked'
    }
    if (normalizedStatus === 'completed' || normalizedStatus === 'done' || normalizedKind === 'final') {
        return 'completed'
    }
    if (normalizedKind === 'work_item') {
        return normalizedStatus ?? 'active'
    }
    return 'running'
}

function inferRequiredCapabilities(input: {
    text?: string | null
    expectedArtifact?: string | null
    doneCriteria?: string | null
}): string[] {
    const bag = `${input.text ?? ''}\n${input.expectedArtifact ?? ''}\n${input.doneCriteria ?? ''}`.toLowerCase()
    const capabilities = new Set<string>()
    if (/(code|implement|refactor|fix|bug|patch|typescript|javascript|react|component|api|route)/.test(bag)) {
        capabilities.add('coding')
    }
    if (/(test|verify|assert|qa|coverage|vitest|unit test|integration)/.test(bag)) {
        capabilities.add('testing')
    }
    if (/(research|investigate|analyze|plan|design|spec|proposal|decision)/.test(bag)) {
        capabilities.add('planning')
    }
    if (/(review|audit|check|lint|inspect)/.test(bag)) {
        capabilities.add('review')
    }
    if (/(report|summary|document|docs|markdown|writeup)/.test(bag)) {
        capabilities.add('documentation')
    }
    return [...capabilities]
}

function pickBestParticipantForDispatch(
    store: Store,
    detail: NonNullable<ReturnType<typeof getSwarmDetail>>,
    namespace: string,
    options: {
        text: string
        expectedArtifact?: string | null
        doneCriteria?: string | null
        excludeParticipantIds?: string[]
    }
) {
    const excluded = new Set(options.excludeParticipantIds ?? [])
    const requiredCapabilities = inferRequiredCapabilities(options)
    const activeAssignments = detail.assignments.filter((item) => item.status !== 'released')
    const activeLeases = detail.leases.filter((item) => item.status === 'active' && (!item.expiresAt || item.expiresAt > Date.now()))
    let best: typeof detail.participants[number] | null = null
    let bestScore = Number.NEGATIVE_INFINITY

    for (const participant of detail.participants) {
        if (excluded.has(participant.id)) {
            continue
        }
        if (participant.kind !== 'agent' || !participant.refId) {
            continue
        }
        const session = store.sessions.getSessionByNamespace(participant.refId, namespace)
        if (!session?.active) {
            continue
        }
        let score = 0
        const capabilities = new Set((participant.capabilities ?? []).map((item) => item.toLowerCase()))
        for (const capability of requiredCapabilities) {
            score += capabilities.has(capability) ? 4 : -1
        }
        const assignmentLoad = activeAssignments.filter((item) => item.participantId === participant.id).length
        const leaseLoad = activeLeases.filter((item) => item.participantId === participant.id).length
        score -= assignmentLoad * 2
        score -= leaseLoad
        score += participant.availability === 'active' ? 2 : 0
        score += participant.model ? 0.5 : 0
        if (score > bestScore) {
            best = participant
            bestScore = score
        }
    }

    return best
}

function buildRoleExecutionContext(detail: NonNullable<ReturnType<typeof getSwarmDetail>>, participantId: string) {
    const bindings = detail.roleBindings.filter((item) => item.participantId === participantId)
    const activeRoles = bindings.map((item) => item.role)
    const profiles = detail.roleProfiles.filter((profile) => activeRoles.includes(profile.role))
    const instructionBlocks = profiles
        .filter((profile) => profile.instructionText?.trim())
        .map((profile) => `Role: ${profile.role}\n${profile.instructionText?.trim()}`)
    const preferredSkillIds = [...new Set(profiles.flatMap((profile) => profile.preferredSkillIds ?? []))]
    const allowedTools = [...new Set(profiles.flatMap((profile) => profile.allowedTools ?? []))]
    const outputContracts = [...new Set(profiles.map((profile) => profile.outputContract).filter((item): item is string => Boolean(item)))]
    return {
        activeRoles,
        profiles,
        instructionText: instructionBlocks.join('\n\n'),
        preferredSkillIds,
        allowedTools,
        outputContracts
    }
}

function getRoleProfilePreferredSkillIds(detail: NonNullable<ReturnType<typeof getSwarmDetail>>, role: string): string[] {
    return [
        ...new Set(
            detail.roleProfiles
                .filter((profile) => profile.role === role)
                .flatMap((profile) => profile.preferredSkillIds ?? [])
        )
    ]
}

function buildRoleExecutionPromptBlocks(
    context: ReturnType<typeof buildRoleExecutionContext>,
    refs?: { swarmId?: string | null; subjectId?: string | null; workItemId?: string | null }
): string {
    const toolCallBlock = refs?.swarmId
        ? `\n[SWARM_TOOL_CALLS]\nUse HAQI tools only for stage effects.\n- record_outcome: proposals, blockers, decisions, summaries\n- record_artifact: diff, patch, report, document, test artifact\n- record_review: approved / changes_requested / commented verdicts\n- record_activity: stage start/completion for explore/implement/verify/coordinate\n- record_effect: fallback only when no stricter tool fits\nUse swarm_id=${refs.swarmId}${refs.subjectId ? `, subject_id=${refs.subjectId}` : ''}${refs.workItemId ? `, work_item_id=${refs.workItemId}` : ''}.\nDo not call tools for every message; only for stage effects.\n[/SWARM_TOOL_CALLS]`
        : ''
    return `${context.activeRoles.length > 0 ? `\n[SWARM_ROLE]\nRoles: ${context.activeRoles.join(', ')}\n[/SWARM_ROLE]` : ''}${context.instructionText ? `\n[SWARM_ROLE_INSTRUCTIONS]\n${context.instructionText}\n[/SWARM_ROLE_INSTRUCTIONS]` : ''}${context.preferredSkillIds.length > 0 ? `\n[SWARM_SKILLS]\nUse these skills if available: ${context.preferredSkillIds.map((item) => `$${item}`).join(', ')}\n[/SWARM_SKILLS]` : ''}${context.allowedTools.length > 0 ? `\n[SWARM_TOOL_POLICY]\nAllowed tools: ${context.allowedTools.join(', ')}\n[/SWARM_TOOL_POLICY]` : ''}${context.outputContracts.length > 0 ? `\n[SWARM_OUTPUT_CONTRACT]\n${context.outputContracts.join('; ')}\n[/SWARM_OUTPUT_CONTRACT]` : ''}${toolCallBlock}`
}

async function pickBestParticipantForDispatchWithSkills(
    store: Store,
    detail: NonNullable<ReturnType<typeof getSwarmDetail>>,
    namespace: string,
    engine: SyncEngine,
    options: {
        text: string
        expectedArtifact?: string | null
        doneCriteria?: string | null
        excludeParticipantIds?: string[]
        preferredSkillIds?: string[]
    }
) {
    const base = pickBestParticipantForDispatch(store, detail, namespace, options)
    const candidates = detail.participants.filter((participant) => participant.kind === 'agent' && participant.refId)
    if (candidates.length === 0) {
        return base
    }
    const preferred = new Set((options.preferredSkillIds ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
    if (preferred.size === 0) {
        return base
    }
    let best = base
    let bestBonus = -1
    for (const participant of candidates) {
        if (options.excludeParticipantIds?.includes(participant.id)) {
            continue
        }
        const session = store.sessions.getSessionByNamespace(participant.refId!, namespace)
        if (!session?.active) {
            continue
        }
        const result = await engine.listSkills(participant.refId!)
        if (!result.success || !result.skills) {
            continue
        }
        const skillSet = new Set(result.skills.map((item) => item.name.trim().toLowerCase()))
        let bonus = 0
        for (const skill of preferred) {
            if (skillSet.has(skill)) {
                bonus += 3
            }
        }
        bonus += scoreAllowedToolsBonus(detail, participant.id, options.expectedArtifact, options.text)
        if (bonus > bestBonus) {
            best = participant
            bestBonus = bonus
        }
    }
    return best
}

function scoreAllowedToolsBonus(
    detail: NonNullable<ReturnType<typeof getSwarmDetail>>,
    participantId: string,
    expectedArtifact?: string | null,
    text?: string | null
): number {
    const context = buildRoleExecutionContext(detail, participantId)
    const allowed = new Set(context.allowedTools.map((item) => item.trim().toLowerCase()))
    const bag = `${expectedArtifact ?? ''}\n${text ?? ''}`.toLowerCase()
    let score = 0
    if (/(test|verify|coverage|assert)/.test(bag) && allowed.has('run_tests')) {
        score += 2
    }
    if (/(code|implement|patch|fix|refactor)/.test(bag) && allowed.has('edit_file')) {
        score += 2
    }
    if (/(research|summary|proposal|decision|report)/.test(bag) && allowed.has('read_file')) {
        score += 1
    }
    return score
}

function syncSwarmRoleBindings(store: Store, swarmId: string, namespace: string) {
    const swarm = store.swarms.getSwarmByNamespace(swarmId, namespace)
    if (!swarm) {
        return []
    }
    const previousBindings = store.swarms.getSwarmRoleBindings(swarmId, namespace)
    const participants = store.swarms.getSwarmParticipants(swarmId, namespace)
    const workItems = store.swarms.getSwarmWorkItems(swarmId, namespace)
    const reviews = store.swarms.getSwarmReviews(swarmId, namespace)
    const activeAgents = participants.filter((participant) => participant.kind === 'agent' && participant.refId)
    const assignedIds = new Set(workItems.map((item) => item.assignedParticipantId).filter((item): item is string => Boolean(item)))
    const reviewerIds = new Set(reviews.map((item) => item.createdByParticipantId).filter((item): item is string => Boolean(item)))
    const nextBindings: Array<{ participantId: string; role: string; phase?: string | null; status?: string }> = []

    const planningCandidate = activeAgents.find((participant) => (participant.capabilities ?? []).some((item) => item.toLowerCase() === 'planning')) ?? activeAgents[0]
    const reviewerCandidate = activeAgents.find((participant) => (participant.capabilities ?? []).some((item) => item.toLowerCase() === 'review'))
        ?? activeAgents.find((participant) => !assignedIds.has(participant.id))
        ?? activeAgents[0]
    const coordinatorCandidate = activeAgents.find((participant) => participant.id !== planningCandidate?.id) ?? planningCandidate

    if (planningCandidate) {
        nextBindings.push({ participantId: planningCandidate.id, role: 'planner', phase: swarm.currentPhase, status: 'active' })
    }
    if (coordinatorCandidate) {
        nextBindings.push({ participantId: coordinatorCandidate.id, role: 'coordinator', phase: swarm.currentPhase, status: 'active' })
    }
    for (const participantId of assignedIds) {
        nextBindings.push({ participantId, role: 'implementer', phase: swarm.currentPhase, status: 'active' })
    }
    if (swarm.currentPhase === 'deliver' || reviewerIds.size > 0 || workItems.some((item) => item.status === 'completed')) {
        if (reviewerCandidate) {
            nextBindings.push({ participantId: reviewerCandidate.id, role: 'reviewer', phase: swarm.currentPhase, status: 'active' })
        }
    }

    const deduped = new Map<string, { participantId: string; role: string; phase?: string | null; status?: string }>()
    for (const binding of nextBindings) {
        deduped.set(`${binding.participantId}:${binding.role}:${binding.phase ?? ''}`, binding)
    }

    store.swarms.resetSwarmRoleBindings({ swarmId, namespace })
    for (const binding of previousBindings) {
        store.swarms.addSwarmRoleBindingHistory({
            swarmId,
            namespace,
            participantId: binding.participantId,
            role: binding.role,
            phase: binding.phase,
            action: 'unbind',
            reason: 'runtime-rebind'
        })
    }
    const roleBindings = [...deduped.values()].map((binding) => store.swarms.addSwarmRoleBinding({
        swarmId,
        namespace,
        participantId: binding.participantId,
        role: binding.role,
        phase: binding.phase,
        status: binding.status
    }))
    for (const binding of roleBindings) {
        store.swarms.addSwarmRoleBindingHistory({
            swarmId,
            namespace,
            participantId: binding.participantId,
            role: binding.role,
            phase: binding.phase,
            action: 'bind',
            reason: 'runtime-rebind'
        })
    }
    return roleBindings
}

function derivePlanSteps(summary: string, maxItems: number): string[] {
    const normalized = summary
        .split(/\n+/)
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter((line) => line.length > 0)
    const candidates = normalized.length > 1
        ? normalized
        : summary
            .split(/(?:[。！？!?]|\. )+/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
    const sliced = candidates.slice(0, maxItems)
    if (sliced.length > 0) {
        return sliced
    }
    return [summary.trim()].filter((item) => item.length > 0)
}

async function createSwarmAutoPlan(
    store: Store,
    getSyncEngine: () => SyncEngine | null,
    options: {
        swarmId: string
        namespace: string
        detail: NonNullable<ReturnType<typeof getSwarmDetail>>
        maxItems: number
        dispatch: boolean
    }
) {
    const summary = options.detail.subject?.summary?.trim()
    if (!summary) {
        return null
    }
    const existingPlanActivity = options.detail.activities.find((item) => item.kind === 'plan')
    if (existingPlanActivity || options.detail.workItems.length > 0) {
        return null
    }
    const steps = derivePlanSteps(summary, options.maxItems)
    const planningThread = options.detail.threads.find((item) => item.kind === 'planning')
        ?? store.swarms.addSwarmThread({
            swarmId: options.swarmId,
            namespace: options.namespace,
            title: 'Planning',
            kind: 'planning',
            status: 'active',
            summary: 'Auto-generated planning thread'
        })
    const planner = pickBestParticipantForDispatch(store, options.detail, options.namespace, {
        text: summary,
        expectedArtifact: 'plan'
    })
    const plannedItems = steps.map((step, index) => {
        const requiredCapabilities = inferRequiredCapabilities({ text: step })
        return {
            index: index + 1,
            title: step.slice(0, 120),
            intent: step,
            requiredCapabilities,
            expectedArtifact: requiredCapabilities.includes('documentation')
                ? 'report'
                : requiredCapabilities.includes('testing')
                    ? 'test-result'
                    : requiredCapabilities.includes('planning')
                        ? 'proposal'
                        : 'code-change',
            doneCriteria: requiredCapabilities.includes('testing')
                ? 'Evidence or tests recorded'
                : requiredCapabilities.includes('planning')
                    ? 'Proposal or decision recorded'
                    : 'Artifact or implementation result recorded'
        }
    })
    const plannerActivity = store.swarms.addSwarmActivity({
        swarmId: options.swarmId,
        namespace: options.namespace,
        subjectId: options.detail.subject?.id ?? null,
        kind: 'plan',
        status: 'completed',
        participantId: planner?.id ?? null,
        content: {
            source: 'policy:auto-plan',
            plannerParticipantId: planner?.id ?? null,
            stepCount: plannedItems.length,
            plannedItems
        }
    })
    for (const planItem of plannedItems) {
        const latestDetail = getSwarmDetail(store, options.swarmId, options.namespace) ?? options.detail
        const preferredSkillIds = getRoleProfilePreferredSkillIds(latestDetail, 'implementer')
        const candidate = getSyncEngine()
            ? await pickBestParticipantForDispatchWithSkills(store, latestDetail, options.namespace, getSyncEngine()!, {
                text: planItem.intent,
                expectedArtifact: planItem.expectedArtifact,
                doneCriteria: planItem.doneCriteria,
                preferredSkillIds
            })
            : pickBestParticipantForDispatch(store, latestDetail, options.namespace, {
                text: planItem.intent,
                expectedArtifact: planItem.expectedArtifact,
                doneCriteria: planItem.doneCriteria
            })
        const workItem = store.swarms.addSwarmWorkItem({
            swarmId: options.swarmId,
            namespace: options.namespace,
            subjectId: options.detail.subject?.id ?? null,
            title: planItem.title,
            intent: planItem.intent,
            status: options.dispatch && candidate ? 'dispatched' : 'open',
            assignedParticipantId: candidate?.id ?? null,
            expectedArtifact: planItem.expectedArtifact,
            doneCriteria: planItem.doneCriteria,
            lastDispatchAt: options.dispatch && candidate ? Date.now() : null
        })
        const entry = store.swarms.addSwarmThreadEntry({
            swarmId: options.swarmId,
            threadId: planningThread.id,
            namespace: options.namespace,
            kind: 'proposal',
            participantId: planner?.id ?? null,
            content: {
                source: 'policy:auto-plan',
                index: planItem.index,
                title: planItem.title,
                workItemId: workItem.id,
                intent: planItem.intent,
                requiredCapabilities: planItem.requiredCapabilities,
                expectedArtifact: planItem.expectedArtifact,
                doneCriteria: planItem.doneCriteria,
                assignedParticipantId: candidate?.id ?? null
            }
        })
        store.swarms.addSwarmOutcome({
            swarmId: options.swarmId,
            namespace: options.namespace,
            subjectId: options.detail.subject?.id ?? null,
            workItemId: workItem.id,
            kind: 'proposal',
            status: 'open',
            createdByParticipantId: planner?.id ?? null,
            content: {
                source: 'policy:auto-plan',
                threadId: planningThread.id,
                threadEntryId: entry.id,
                title: planItem.title,
                intent: planItem.intent,
                requiredCapabilities: planItem.requiredCapabilities,
                expectedArtifact: planItem.expectedArtifact,
                doneCriteria: planItem.doneCriteria
            }
        })
        if (options.dispatch && candidate?.refId) {
            const dispatchAt = Date.now()
            store.swarms.releaseSwarmWorkItemAssignments({
                swarmId: options.swarmId,
                workItemId: workItem.id,
                namespace: options.namespace,
                reason: 'policy:auto-plan-dispatch'
            })
            const assignment = store.swarms.addSwarmWorkItemAssignment({
                swarmId: options.swarmId,
                workItemId: workItem.id,
                participantId: candidate.id,
                namespace: options.namespace,
                status: 'active',
                reason: 'policy:auto-plan-dispatch'
            })
            store.swarms.upsertSwarmParticipantLease({
                swarmId: options.swarmId,
                workItemId: workItem.id,
                participantId: candidate.id,
                namespace: options.namespace,
                status: 'active',
                lastHeartbeatAt: dispatchAt,
                expiresAt: dispatchAt + 30 * 60 * 1000
            })
            const engine = getSyncEngine()
            if (engine) {
                const latestDetail = getSwarmDetail(store, options.swarmId, options.namespace) ?? options.detail
                const roleExecutionContext = buildRoleExecutionContext(latestDetail, candidate.id)
                await engine.sendMessage(candidate.refId, {
                    text: `[SWARM_CONTEXT]\nSwarm: ${options.detail.swarm.title}\nSwarm ID: ${options.swarmId}\nSubject: ${summary}\nSubject ID: ${options.detail.subject?.id ?? '—'}\nCurrent phase: ${options.detail.swarm.currentPhase}\nWork item ID: ${workItem.id}\nExpected artifact: ${planItem.expectedArtifact}\n[/SWARM_CONTEXT]${buildRoleExecutionPromptBlocks(roleExecutionContext, { swarmId: options.swarmId, subjectId: options.detail.subject?.id ?? null, workItemId: workItem.id })}\n\n${planItem.intent}`,
                    sentFrom: 'webapp',
                    meta: {
                        swarmId: options.swarmId,
                        participantId: candidate.id,
                        swarmWorkItemId: workItem.id,
                        plannerActivityId: plannerActivity.id,
                        swarmRoles: roleExecutionContext.activeRoles,
                        swarmPreferredSkillIds: roleExecutionContext.preferredSkillIds,
                        swarmAllowedTools: roleExecutionContext.allowedTools,
                        swarmOutputContracts: roleExecutionContext.outputContracts
                    }
                })
                store.swarms.addSwarmEvent({
                    swarmId: options.swarmId,
                    namespace: options.namespace,
                    type: 'auto-dispatch-requested',
                    payload: {
                        source: 'policy:auto-plan',
                        workItemId: workItem.id,
                        participantId: candidate.id,
                        sessionId: candidate.refId,
                        assignmentId: assignment.id
                    }
                })
            }
        }
    }
    return { plannerActivity, planningThread }
}

function hasPolicy(detail: NonNullable<ReturnType<typeof getSwarmDetail>>, kinds: string[]): boolean {
    const normalized = new Set(kinds.map((item) => item.toLowerCase()))
    return detail.policies.some((policy) => policy.status !== 'disabled' && normalized.has(policy.kind.toLowerCase()))
}

function getPolicyConfig<T extends Record<string, unknown>>(
    detail: NonNullable<ReturnType<typeof getSwarmDetail>>,
    kind: string
): T {
    const policy = detail.policies.find((item) => item.kind.toLowerCase() === kind.toLowerCase() && item.status !== 'disabled')
    return ((policy?.config && typeof policy.config === 'object') ? policy.config : {}) as T
}

async function applySwarmPolicies(
    store: Store,
    getSyncEngine: () => SyncEngine | null,
    swarmId: string,
    namespace: string
) {
    const detail = getSwarmDetail(store, swarmId, namespace)
    if (!detail) {
        return
    }
    const subjectId = detail.subject?.id ?? null
    const plannerBinding = detail.roleBindings.find((item) => item.role === 'planner')
    const coordinatorBinding = detail.roleBindings.find((item) => item.role === 'coordinator')
    const reviewerBinding = detail.roleBindings.find((item) => item.role === 'reviewer')
    const autonomyConfig = getPolicyConfig<{
        auto?: boolean
        autoPlanOnDefine?: boolean
        autoDispatchOnPlan?: boolean
        autoPlanMaxItems?: number
        maxAutoDispatches?: number
        maxAutoReassignments?: number
        stopOnDeliver?: boolean
    }>(detail, 'autonomy')
    const autoDispatchCount = detail.events.filter((event) => event.type === 'auto-dispatch-requested').length
    const autoReassignCount = detail.events.filter((event) => event.type === 'work-item-reassigned').length

    if (autonomyConfig.stopOnDeliver && (detail.swarm.currentPhase === 'deliver' || detail.swarm.status === 'completed' || detail.swarm.status === 'canceled')) {
        const alreadyPaused = detail.events.some((event) => event.type === 'autonomy-paused')
        if (!alreadyPaused) {
            store.swarms.addSwarmEvent({
                swarmId,
                namespace,
                type: 'autonomy-paused',
                payload: {
                    reason: 'deliver-phase'
                }
            })
        }
        return
    }

    const autoDispatchBudgetExceeded = typeof autonomyConfig.maxAutoDispatches === 'number' && autoDispatchCount >= autonomyConfig.maxAutoDispatches
    const autoReassignBudgetExceeded = typeof autonomyConfig.maxAutoReassignments === 'number' && autoReassignCount >= autonomyConfig.maxAutoReassignments

    if (autoDispatchBudgetExceeded || autoReassignBudgetExceeded) {
        const pausedReason = autoDispatchBudgetExceeded ? 'max-auto-dispatches' : 'max-auto-reassignments'
        const alreadyPaused = detail.events.some((event) => event.type === 'autonomy-paused' && ((event.payload as Record<string, unknown> | null)?.reason === pausedReason))
        if (!alreadyPaused) {
            store.swarms.addSwarmEvent({
                swarmId,
                namespace,
                type: 'autonomy-paused',
                payload: {
                    reason: pausedReason
                }
            })
        }
    }

    if (detail.workItems.length === 0 && detail.subject?.summary?.trim()) {
        const shouldAutoPlan = autonomyConfig.auto === true && autonomyConfig.autoPlanOnDefine !== false
        if (shouldAutoPlan && !autoDispatchBudgetExceeded) {
            await createSwarmAutoPlan(store, getSyncEngine, {
                swarmId,
                namespace,
                detail,
                maxItems: Math.max(1, Math.min(autonomyConfig.autoPlanMaxItems ?? 3, 8)),
                dispatch: autonomyConfig.autoDispatchOnPlan === true
            })
        }
    }

    if (hasPolicy(detail, ['escalation'])) {
        const escalationConfig = getPolicyConfig<{ maxBlockersPerWorkItem?: number }>(detail, 'escalation')
        for (const workItem of detail.workItems.filter((item) => item.status === 'blocked')) {
            const blockerCount = detail.threadEntries.filter((entry) => {
                if (entry.kind !== 'blocker') return false
                const content = entry.content && typeof entry.content === 'object' ? entry.content as Record<string, unknown> : null
                return content?.workItemId === workItem.id
            }).length
            if (typeof escalationConfig.maxBlockersPerWorkItem === 'number' && blockerCount >= escalationConfig.maxBlockersPerWorkItem) {
                continue
            }
            const existing = detail.threadEntries.find((entry) => {
                if (entry.kind !== 'blocker') return false
                const content = entry.content && typeof entry.content === 'object' ? entry.content as Record<string, unknown> : null
                return content?.workItemId === workItem.id && content?.source === 'policy:escalation'
            })
            if (existing) {
                continue
            }
            const blockerThread = detail.threads.find((thread) => thread.kind === 'blocker' && thread.summary?.includes(workItem.id))
                ?? store.swarms.addSwarmThread({
                    swarmId,
                    namespace,
                    title: `Blocker: ${workItem.title}`,
                    kind: 'blocker',
                    status: 'open',
                    summary: `Auto escalation for work item ${workItem.id}`
                })
            const entry = store.swarms.addSwarmThreadEntry({
                swarmId,
                threadId: blockerThread.id,
                namespace,
                kind: 'blocker',
                participantId: coordinatorBinding?.participantId ?? null,
                content: {
                    source: 'policy:escalation',
                    workItemId: workItem.id,
                    title: workItem.title,
                    intent: workItem.intent ?? null
                }
            })
            store.swarms.addSwarmOutcome({
                swarmId,
                namespace,
                subjectId,
                workItemId: workItem.id,
                kind: 'blocker',
                status: 'blocked',
                createdByParticipantId: coordinatorBinding?.participantId ?? null,
                content: {
                    threadId: blockerThread.id,
                    threadEntryId: entry.id,
                    source: 'policy:escalation'
                }
            })
            store.swarms.addSwarmActivity({
                swarmId,
                namespace,
                subjectId,
                workItemId: workItem.id,
                kind: 'coordinate',
                status: 'blocked',
                participantId: coordinatorBinding?.participantId ?? null,
                content: {
                    source: 'policy:escalation',
                    threadId: blockerThread.id,
                    threadEntryId: entry.id
                }
            })
            store.swarms.addSwarmEvent({
                swarmId,
                namespace,
                type: 'policy-escalation',
                payload: {
                    workItemId: workItem.id,
                    threadId: blockerThread.id,
                    threadEntryId: entry.id
                }
            })
        }
    }

    if (hasPolicy(detail, ['deliberation', 'debate', 'rebuttal'])) {
        const deliberationConfig = getPolicyConfig<{ maxRebuttalsPerThread?: number }>(detail, 'deliberation')
        for (const entry of detail.threadEntries.filter((item) => item.kind === 'blocker')) {
            const rebuttalCount = detail.threadEntries.filter((candidate) => candidate.threadId === entry.threadId && candidate.kind === 'rebuttal').length
            if (typeof deliberationConfig.maxRebuttalsPerThread === 'number' && rebuttalCount >= deliberationConfig.maxRebuttalsPerThread) {
                continue
            }
            const rebuttalExists = detail.threadEntries.some((candidate) =>
                candidate.threadId === entry.threadId
                && candidate.kind === 'rebuttal'
                && (candidate.replyToEntryId === entry.id || (candidate.citesEntryIds ?? []).includes(entry.id))
            )
            if (rebuttalExists) {
                continue
            }
            const content = entry.content && typeof entry.content === 'object' ? entry.content as Record<string, unknown> : null
            const workItemId = typeof content?.workItemId === 'string' ? content.workItemId : null
            const rebuttal = store.swarms.addSwarmThreadEntry({
                swarmId,
                threadId: entry.threadId,
                namespace,
                kind: 'rebuttal',
                participantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                replyToEntryId: entry.id,
                citesEntryIds: [entry.id],
                content: {
                    source: 'policy:auto-rebuttal',
                    blockerEntryId: entry.id,
                    workItemId,
                    suggestion: 'Re-scope, reassign, or split the blocked work item.'
                }
            })
            store.swarms.addSwarmOutcome({
                swarmId,
                namespace,
                subjectId,
                workItemId,
                kind: 'summary',
                status: 'open',
                createdByParticipantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                content: {
                    source: 'policy:auto-rebuttal',
                    threadId: entry.threadId,
                    threadEntryId: rebuttal.id
                }
            })
        }
        for (const thread of detail.threads) {
            const threadEntries = detail.threadEntries.filter((entry) => entry.threadId === thread.id)
            const proposalCount = threadEntries.filter((entry) => entry.kind === 'proposal').length
            const rebuttalCount = threadEntries.filter((entry) => entry.kind === 'rebuttal').length
            const decisionExists = threadEntries.some((entry) => entry.kind === 'decision')
            if (decisionExists || proposalCount === 0 || rebuttalCount === 0) {
                continue
            }
            if (typeof deliberationConfig.maxRebuttalsPerThread === 'number' && rebuttalCount < deliberationConfig.maxRebuttalsPerThread) {
                continue
            }
            const latestProposal = [...threadEntries].reverse().find((entry) => entry.kind === 'proposal') ?? threadEntries[0] ?? null
            const decisionEntry = store.swarms.addSwarmThreadEntry({
                swarmId,
                threadId: thread.id,
                namespace,
                kind: 'decision',
                participantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                replyToEntryId: latestProposal?.id ?? null,
                citesEntryIds: latestProposal ? [latestProposal.id] : [],
                content: {
                    source: 'policy:auto-decision',
                    proposalCount,
                    rebuttalCount,
                    selectedEntryId: latestProposal?.id ?? null,
                    resolution: 'Sufficient deliberation reached; converge on current proposal.'
                }
            })
            store.swarms.addSwarmOutcome({
                swarmId,
                namespace,
                subjectId,
                kind: 'decision',
                status: 'completed',
                createdByParticipantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                content: {
                    source: 'policy:auto-decision',
                    threadId: thread.id,
                    threadEntryId: decisionEntry.id
                }
            })
            store.swarms.addSwarmActivity({
                swarmId,
                namespace,
                subjectId,
                kind: 'summarize',
                status: 'completed',
                participantId: plannerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                content: {
                    source: 'policy:auto-decision',
                    threadId: thread.id,
                    threadEntryId: decisionEntry.id
                }
            })
            store.swarms.addSwarmEvent({
                swarmId,
                namespace,
                type: 'policy-decision',
                payload: {
                    threadId: thread.id,
                    threadEntryId: decisionEntry.id
                }
            })
        }
    }

    if (hasPolicy(detail, ['review', 'verification']) && !autoDispatchBudgetExceeded) {
        const reviewConfig = getPolicyConfig<{ maxRequests?: number }>(detail, 'review')
        const reviewRequestCount = detail.events.filter((event) => event.type === 'review-requested').length
        for (const workItem of detail.workItems.filter((item) => item.status === 'completed')) {
            if (typeof reviewConfig.maxRequests === 'number' && reviewRequestCount >= reviewConfig.maxRequests) {
                break
            }
            const existingReview = detail.reviews.find((review) => review.workItemId === workItem.id)
            const existingRequest = detail.events.find((event) => {
                const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : null
                return event.type === 'review-requested' && payload?.workItemId === workItem.id
            })
            if (existingReview || existingRequest) {
                continue
            }
            const reviewThread = detail.threads.find((thread) => thread.kind === 'review' && thread.summary?.includes(workItem.id))
                ?? store.swarms.addSwarmThread({
                    swarmId,
                    namespace,
                    title: `Review: ${workItem.title}`,
                    kind: 'review',
                    status: 'open',
                    summary: `Auto review request for work item ${workItem.id}`
                })
            const request = store.swarms.addSwarmThreadEntry({
                swarmId,
                threadId: reviewThread.id,
                namespace,
                kind: 'review_request',
                participantId: reviewerBinding?.participantId ?? coordinatorBinding?.participantId ?? null,
                content: {
                    source: 'policy:review',
                    workItemId: workItem.id,
                    title: workItem.title
                }
            })
            store.swarms.addSwarmActivity({
                swarmId,
                namespace,
                subjectId,
                workItemId: workItem.id,
                kind: 'verify',
                status: 'open',
                participantId: reviewerBinding?.participantId ?? null,
                content: {
                    source: 'policy:review',
                    threadId: reviewThread.id,
                    threadEntryId: request.id
                }
            })
            store.swarms.addSwarmEvent({
                swarmId,
                namespace,
                type: 'review-requested',
                payload: {
                    workItemId: workItem.id,
                    threadId: reviewThread.id,
                    reviewerParticipantId: reviewerBinding?.participantId ?? null
                }
            })
            const reviewer = reviewerBinding
                ? detail.participants.find((item) => item.id === reviewerBinding.participantId)
                : null
            const engine = getSyncEngine()
            if (engine && reviewer?.refId) {
                const roleExecutionContext = buildRoleExecutionContext(detail, reviewer.id)
                void engine.sendMessage(reviewer.refId, {
                    text: `[SWARM_CONTEXT]\nSwarm: ${detail.swarm.title}\nSwarm ID: ${swarmId}\nCurrent phase: ${detail.swarm.currentPhase}\nReview requested for: ${workItem.title}\nSubject ID: ${detail.subject?.id ?? '—'}\nWork item ID: ${workItem.id}\n[/SWARM_CONTEXT]${buildRoleExecutionPromptBlocks(roleExecutionContext, { swarmId, subjectId: detail.subject?.id ?? null, workItemId: workItem.id })}\n\nPlease review this work item and produce a verdict.`,
                    sentFrom: 'webapp',
                    meta: {
                        swarmId,
                        participantId: reviewer.id,
                        swarmWorkItemId: workItem.id,
                        reviewThreadId: reviewThread.id
                    }
                })
            }
        }
    }
}

function deriveWorkItemStatusFromArtifact(status: string | undefined): string | null {
    const normalized = status?.trim().toLowerCase()
    if (!normalized) {
        return 'running'
    }
    if (['completed', 'complete', 'final', 'published', 'ready'].includes(normalized)) {
        return 'completed'
    }
    if (normalized === 'blocked') {
        return 'blocked'
    }
    if (normalized === 'canceled') {
        return 'canceled'
    }
    return 'running'
}

function deriveWorkItemStatusFromArtifactWithContract(
    status: string | undefined,
    outputContracts: string[]
): string | null {
    const base = deriveWorkItemStatusFromArtifact(status)
    const contracts = outputContracts.map((item) => item.toLowerCase())
    if (contracts.some((item) => item.includes('review verdict'))) {
        return 'running'
    }
    return base
}

function recomputeSwarmLifecycle(store: Store, swarmId: string, namespace: string) {
    const swarm = store.swarms.getSwarmByNamespace(swarmId, namespace)
    if (!swarm) {
        return null
    }
    const workItems = store.swarms.getSwarmWorkItems(swarmId, namespace)
    const outcomes = store.swarms.getSwarmOutcomes(swarmId, namespace)
    let currentPhase = swarm.currentPhase
    let status = swarm.status

    if (workItems.length === 0) {
        currentPhase = 'define'
        status = 'active'
    } else if (workItems.some((item) => item.status === 'running' || item.status === 'active' || item.status === 'dispatched')) {
        currentPhase = 'execute'
        status = 'active'
    } else if (outcomes.some((item) => item.kind === 'decision')) {
        currentPhase = 'decide'
        status = 'active'
    } else if (workItems.some((item) => item.status === 'blocked')) {
        currentPhase = 'execute'
        status = 'blocked'
    } else if (workItems.every((item) => item.status === 'completed' || item.status === 'canceled')) {
        currentPhase = 'deliver'
        status = workItems.some((item) => item.status === 'completed') ? 'completed' : 'canceled'
    } else {
        currentPhase = 'explore'
        status = 'active'
    }

    if (currentPhase === swarm.currentPhase && status === swarm.status) {
        syncSwarmRoleBindings(store, swarmId, namespace)
        return swarm
    }
    const updated = store.swarms.updateSwarm({
        swarmId,
        namespace,
        currentPhase,
        status
    })
    syncSwarmRoleBindings(store, swarmId, namespace)
    return updated
}

async function runSwarmAutomation(
    store: Store,
    getSyncEngine: () => SyncEngine | null,
    swarmId: string,
    namespace: string
): Promise<void> {
    await withSwarmAutomationLock(swarmId, namespace, async () => {
        recomputeSwarmLifecycle(store, swarmId, namespace)
        await applySwarmPolicies(store, getSyncEngine, swarmId, namespace)
        recomputeSwarmLifecycle(store, swarmId, namespace)
    })
}

export function createSwarmsRoutes(store: Store, getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/swarms', (c) => {
        const namespace = c.get('namespace')
        const swarms = store.swarms.getSwarmsByNamespace(namespace).map((swarm) => {
            const latestOutcome = store.swarms.getSwarmOutcomes(swarm.id, namespace)[0]
            let latestOutcomePreview: string | null = null
            if (latestOutcome) {
                if (typeof latestOutcome.content === 'string') {
                    latestOutcomePreview = latestOutcome.content.slice(0, 140)
                } else if (latestOutcome.content && typeof latestOutcome.content === 'object') {
                    latestOutcomePreview = JSON.stringify(latestOutcome.content).slice(0, 140)
                } else {
                    latestOutcomePreview = latestOutcome.kind
                }
            }
            return {
                ...swarm,
                latestOutcomePreview
            }
        })
        return c.json({ swarms })
    })

    app.post('/swarms', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = createSwarmSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const namespace = c.get('namespace')
        try {
            const swarm = store.swarms.createSwarm({
                namespace,
                title: parsed.data.title,
                createdBy: parsed.data.createdBy ?? null,
                status: parsed.data.status,
                currentPhase: parsed.data.currentPhase,
                subject: parsed.data.subject
                    ? {
                        kind: parsed.data.subject.kind,
                        summary: parsed.data.subject.summary,
                        successCriteria: parsed.data.subject.successCriteria ?? null,
                        constraints: parsed.data.subject.constraints,
                        status: parsed.data.subject.status
                    }
                    : undefined
            })
            store.swarms.addSwarmPolicy({
                swarmId: swarm.id,
                namespace,
                kind: 'escalation',
                status: 'active',
                config: {
                    auto: true,
                    maxBlockersPerWorkItem: 1
                }
            })
            store.swarms.addSwarmPolicy({
                swarmId: swarm.id,
                namespace,
                kind: 'review',
                status: 'active',
                config: {
                    auto: true,
                    maxRequests: 12
                }
            })
            store.swarms.addSwarmPolicy({
                swarmId: swarm.id,
                namespace,
                kind: 'deliberation',
                status: 'active',
                config: {
                    auto: true,
                    maxRebuttalsPerThread: 2
                }
            })
            store.swarms.addSwarmPolicy({
                swarmId: swarm.id,
                namespace,
                kind: 'autonomy',
                status: 'active',
                config: {
                    auto: true,
                    autoPlanOnDefine: true,
                    autoDispatchOnPlan: false,
                    autoPlanMaxItems: 3,
                    maxAutoDispatches: 12,
                    maxAutoReassignments: 6,
                    stopOnDeliver: true
                }
            })
            store.swarms.addSwarmRoleProfile({
                swarmId: swarm.id,
                namespace,
                role: 'planner',
                instructionText: 'Clarify goal; produce structured plan; prefer proposal/decision outputs; avoid direct implementation unless needed. When you form a proposal, blocker, decision, or summary, call record_outcome.',
                preferredSkillIds: ['research-repo', 'summarize-thread'],
                allowedTools: ['read_file', 'search_code', 'grep'],
                outputContract: 'proposal or decision'
            })
            store.swarms.addSwarmRoleProfile({
                swarmId: swarm.id,
                namespace,
                role: 'implementer',
                instructionText: 'Consume assigned work item; implement artifact; do not change mission; emit blocker when blocked. Record stage starts/completions with record_activity. Record deliverables with record_artifact. Record blockers with record_outcome.',
                preferredSkillIds: ['implement-change', 'write-tests'],
                allowedTools: ['read_file', 'edit_file', 'run_tests'],
                outputContract: 'artifact plus summary'
            })
            store.swarms.addSwarmRoleProfile({
                swarmId: swarm.id,
                namespace,
                role: 'reviewer',
                instructionText: 'Review artifact or diff; return approved or changes_requested with evidence. When you reach a verdict, call record_review.',
                preferredSkillIds: ['review-artifact'],
                allowedTools: ['read_file', 'search_code', 'run_tests'],
                outputContract: 'review verdict'
            })
            store.swarms.addSwarmRoleProfile({
                swarmId: swarm.id,
                namespace,
                role: 'coordinator',
                instructionText: 'Track progress; escalate blockers; trigger synthesis and next step; avoid changing technical direction without planner. Record coordination starts/completions with record_activity and blockers/summaries with record_outcome.',
                preferredSkillIds: ['summarize-thread', 'escalate-blocker'],
                allowedTools: ['read_file', 'search_code'],
                outputContract: 'summary or blocker'
            })
            syncSwarmRoleBindings(store, swarm.id, namespace)
            return c.json({ swarm: getSwarmDetail(store, swarm.id, namespace) }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id', (c) => {
        const namespace = c.get('namespace')
        const detail = getSwarmDetail(store, c.req.param('id'), namespace)
        if (!detail) {
            return c.json({ error: 'Swarm not found' }, 404)
        }
        return c.json({ swarm: detail })
    })

    app.get('/swarms/:id/skills', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const detail = getSwarmDetail(store, c.req.param('id'), namespace)
        if (!detail) {
            return c.json({ error: 'Swarm not found' }, 404)
        }
        const seen = new Map<string, { name: string; description?: string }>()
        for (const participant of detail.participants) {
            if (participant.kind !== 'agent' || !participant.refId) {
                continue
            }
            const result = await engine.listSkills(participant.refId).catch(() => ({ success: false as const }))
            if (!result.success || !result.skills) {
                continue
            }
            for (const skill of result.skills) {
                const key = skill.name.trim().toLowerCase()
                if (!key || seen.has(key)) {
                    continue
                }
                seen.set(key, skill)
            }
        }
        return c.json({ success: true, skills: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) })
    })

    app.patch('/swarms/:id', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateSwarmSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const namespace = c.get('namespace')
        try {
            const swarm = store.swarms.updateSwarm({
                swarmId: c.req.param('id'),
                namespace,
                title: parsed.data.title,
                status: parsed.data.status,
                currentPhase: parsed.data.currentPhase
            })
            if (!swarm) {
                return c.json({ error: 'Swarm not found' }, 404)
            }
            return c.json({ swarm: getSwarmDetail(store, swarm.id, namespace) })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/subject', (c) => {
        const subject = store.swarms.getSwarmSubject(c.req.param('id'), c.get('namespace'))
        return c.json({ subject })
    })

    app.patch('/swarms/:id/subject', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateSubjectSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const subject = store.swarms.updateSwarmSubject({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                kind: parsed.data.kind,
                summary: parsed.data.summary,
                successCriteria: parsed.data.successCriteria,
                constraints: parsed.data.constraints,
                status: parsed.data.status
            })
            return c.json({ subject })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/participants', (c) => {
        const participants = store.swarms.getSwarmParticipants(c.req.param('id'), c.get('namespace'))
        return c.json({ participants })
    })

    app.post('/swarms/:id/participants', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addParticipantSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            let provider = parsed.data.provider
            let model = parsed.data.model
            let capabilities = parsed.data.capabilities
            let availability = parsed.data.availability

            if (parsed.data.kind === 'agent' && parsed.data.refId) {
                const session = store.sessions.getSessionByNamespace(parsed.data.refId, c.get('namespace'))
                const metadata = (session?.metadata && typeof session.metadata === 'object')
                    ? session.metadata as Record<string, unknown>
                    : null
                provider = provider ?? (typeof metadata?.flavor === 'string' ? metadata.flavor : null) ?? undefined
                model = model ?? (typeof metadata?.model === 'string' ? metadata.model : null) ?? undefined
                if (!capabilities) {
                    const tools = Array.isArray(metadata?.tools)
                        ? metadata?.tools.filter((item): item is string => typeof item === 'string')
                        : []
                    capabilities = tools.length > 0 ? tools : undefined
                }
                availability = availability ?? (session?.active ? 'active' : 'inactive')
            }

            const participant = store.swarms.addSwarmParticipant({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                kind: parsed.data.kind,
                refId: parsed.data.refId,
                provider,
                model,
                capabilities,
                availability
            })
            return c.json({ participant }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.delete('/swarms/:id/participants/:participantId', (c) => {
        const removed = store.swarms.removeSwarmParticipant(c.req.param('id'), c.get('namespace'), c.req.param('participantId'))
        if (!removed) {
            return c.json({ error: 'Participant not found' }, 404)
        }
        return c.json({ success: true })
    })

    app.get('/swarms/:id/activities', (c) => {
        return c.json({ activities: store.swarms.getSwarmActivities(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/activities', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addActivitySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const activity = store.swarms.addSwarmActivity({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                subjectId: parsed.data.subjectId,
                workItemId: parsed.data.workItemId,
                kind: parsed.data.kind,
                status: parsed.data.status,
                participantId: parsed.data.participantId,
                content: parsed.data.content
            })
            return c.json({ activity }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/role-bindings', (c) => {
        return c.json({ roleBindings: store.swarms.getSwarmRoleBindings(c.req.param('id'), c.get('namespace')) })
    })

    app.get('/swarms/:id/role-profiles', (c) => {
        return c.json({ roleProfiles: store.swarms.getSwarmRoleProfiles(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/role-bindings', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addRoleBindingSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const roleBinding = store.swarms.addSwarmRoleBinding({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                participantId: parsed.data.participantId,
                role: parsed.data.role,
                phase: parsed.data.phase,
                status: parsed.data.status
            })
            store.swarms.addSwarmRoleBindingHistory({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                participantId: parsed.data.participantId,
                role: parsed.data.role,
                phase: parsed.data.phase,
                action: 'bind',
                reason: 'manual'
            })
            return c.json({ roleBinding }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/swarms/:id/role-profiles', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addRoleProfileSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const roleProfile = store.swarms.addSwarmRoleProfile({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                role: parsed.data.role,
                instructionText: withSwarmRoleProfileToolGuidance(parsed.data.role, parsed.data.instructionText),
                preferredSkillIds: parsed.data.preferredSkillIds,
                allowedTools: parsed.data.allowedTools,
                outputContract: parsed.data.outputContract
            })
            return c.json({ roleProfile }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.patch('/swarms/:id/role-profiles/:roleProfileId', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateRoleProfileSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const existingProfile = store.swarms
                .getSwarmRoleProfiles(c.req.param('id'), c.get('namespace'))
                .find((profile) => profile.id === c.req.param('roleProfileId'))
            if (!existingProfile) {
                return c.json({ error: 'Role profile not found' }, 404)
            }
            const roleProfile = store.swarms.updateSwarmRoleProfile({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                roleProfileId: c.req.param('roleProfileId'),
                instructionText: parsed.data.instructionText === undefined
                    ? undefined
                    : withSwarmRoleProfileToolGuidance(existingProfile.role, parsed.data.instructionText),
                preferredSkillIds: parsed.data.preferredSkillIds,
                allowedTools: parsed.data.allowedTools,
                outputContract: parsed.data.outputContract
            })
            return c.json({ roleProfile })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/threads', (c) => {
        return c.json({ threads: store.swarms.getSwarmThreads(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/threads', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addThreadSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const thread = store.swarms.addSwarmThread({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                title: parsed.data.title,
                kind: parsed.data.kind,
                status: parsed.data.status,
                summary: parsed.data.summary
            })
            return c.json({ thread }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/thread-entries', (c) => {
        return c.json({ threadEntries: store.swarms.getSwarmThreadEntries(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/thread-entries', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addThreadEntrySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const threadEntry = store.swarms.addSwarmThreadEntry({
                swarmId: c.req.param('id'),
                threadId: parsed.data.threadId,
                namespace: c.get('namespace'),
                kind: parsed.data.kind,
                participantId: parsed.data.participantId,
                replyToEntryId: parsed.data.replyToEntryId,
                citesEntryIds: parsed.data.citesEntryIds,
                content: parsed.data.content
            })
            if (['proposal', 'rebuttal', 'blocker', 'decision', 'summary'].includes(parsed.data.kind)) {
                store.swarms.addSwarmOutcome({
                    swarmId: c.req.param('id'),
                    namespace: c.get('namespace'),
                    subjectId: store.swarms.getSwarmSubject(c.req.param('id'), c.get('namespace'))?.id ?? null,
                    kind: parsed.data.kind === 'rebuttal' ? 'summary' : parsed.data.kind,
                    status: parsed.data.kind === 'decision' ? 'completed' : 'open',
                    createdByParticipantId: parsed.data.participantId,
                    content: {
                        threadId: parsed.data.threadId,
                        threadEntryId: threadEntry.id,
                        replyToEntryId: parsed.data.replyToEntryId ?? null,
                        citesEntryIds: parsed.data.citesEntryIds ?? [],
                        content: parsed.data.content ?? null
                    }
                })
                await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), c.get('namespace'))
            }
            return c.json({ threadEntry }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/swarms/:id/threads/:threadId/synthesize', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = synthesizeThreadSchema.safeParse(body ?? {})
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const swarmId = c.req.param('id')
        const namespace = c.get('namespace')
        const detail = getSwarmDetail(store, swarmId, namespace)
        if (!detail) {
            return c.json({ error: 'Swarm not found' }, 404)
        }
        const threadId = c.req.param('threadId')
        const thread = detail.threads.find((item) => item.id === threadId)
        if (!thread) {
            return c.json({ error: 'Thread not found' }, 404)
        }
        const entries = detail.threadEntries.filter((item) => item.threadId === threadId)
        const proposals = entries.filter((item) => item.kind === 'proposal')
        const blockers = entries.filter((item) => item.kind === 'blocker')
        const rebuttals = entries.filter((item) => item.kind === 'rebuttal')
        const latestProposal = proposals[0] ?? entries[0] ?? null
        const kind = parsed.data.asDecision ? 'decision' : 'summary'
        const summary = {
            threadId,
            proposalCount: proposals.length,
            blockerCount: blockers.length,
            rebuttalCount: rebuttals.length,
            selectedEntryId: latestProposal?.id ?? null,
            note: latestProposal?.content ?? thread.summary ?? thread.title
        }
        try {
            const threadEntry = store.swarms.addSwarmThreadEntry({
                swarmId,
                threadId,
                namespace,
                kind,
                participantId: null,
                replyToEntryId: latestProposal?.id ?? null,
                citesEntryIds: latestProposal ? [latestProposal.id] : [],
                content: summary
            })
            const outcome = store.swarms.addSwarmOutcome({
                swarmId,
                namespace,
                subjectId: detail.subject?.id ?? null,
                kind,
                status: kind === 'decision' ? 'completed' : 'open',
                content: {
                    threadEntryId: threadEntry.id,
                    ...summary
                }
            })
            store.swarms.addSwarmActivity({
                swarmId,
                namespace,
                subjectId: detail.subject?.id ?? null,
                kind: 'summarize',
                status: 'completed',
                content: {
                    threadId,
                    outcomeId: outcome.id,
                    kind
                }
            })
            await runSwarmAutomation(store, getSyncEngine, swarmId, namespace)
            return c.json({ threadEntry, outcome }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/policies', (c) => {
        return c.json({ policies: store.swarms.getSwarmPolicies(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/policies', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addPolicySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const policy = store.swarms.addSwarmPolicy({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                kind: parsed.data.kind,
                status: parsed.data.status,
                config: parsed.data.config
            })
            return c.json({ policy }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.patch('/swarms/:id/policies/:policyId', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updatePolicySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const policy = store.swarms.updateSwarmPolicy({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                policyId: c.req.param('policyId'),
                status: parsed.data.status,
                config: parsed.data.config
            })
            if (!policy) {
                return c.json({ error: 'Policy not found' }, 404)
            }
            await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), c.get('namespace'))
            return c.json({ policy })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/swarms/:id/policies/run', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = runPoliciesSchema.safeParse(body ?? {})
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const swarmId = c.req.param('id')
        const namespace = c.get('namespace')
        const detail = getSwarmDetail(store, swarmId, namespace)
        if (!detail) {
            return c.json({ error: 'Swarm not found' }, 404)
        }
        await runSwarmAutomation(store, getSyncEngine, swarmId, namespace)
        return c.json({ ok: true, forced: parsed.data.force ?? false })
    })

    app.get('/swarms/:id/reviews', (c) => {
        return c.json({ reviews: store.swarms.getSwarmReviews(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/reviews', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addReviewSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const review = store.swarms.addSwarmReview({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: parsed.data.workItemId,
                artifactId: parsed.data.artifactId,
                status: parsed.data.status,
                verdict: parsed.data.verdict,
                summary: parsed.data.summary,
                createdByParticipantId: parsed.data.createdByParticipantId
            })
            const nextStatus = parsed.data.verdict === 'approved'
                ? 'completed'
                : parsed.data.verdict === 'changes_requested'
                    ? 'blocked'
                    : null
            maybeAdvanceWorkItem(store, {
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: parsed.data.workItemId,
                toStatus: nextStatus,
                reason: `review:${parsed.data.verdict ?? parsed.data.status ?? 'open'}`,
                byParticipantId: parsed.data.createdByParticipantId ?? null
            })
            recomputeSwarmLifecycle(store, c.req.param('id'), c.get('namespace'))
            await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), c.get('namespace'))
            return c.json({ review }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.patch('/swarms/:id/reviews/:reviewId', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateReviewSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const review = store.swarms.updateSwarmReview({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                reviewId: c.req.param('reviewId'),
                status: parsed.data.status,
                verdict: parsed.data.verdict,
                summary: parsed.data.summary
            })
            if (!review) {
                return c.json({ error: 'Review not found' }, 404)
            }
            const nextStatus = parsed.data.verdict === 'approved'
                ? 'completed'
                : parsed.data.verdict === 'changes_requested'
                    ? 'blocked'
                    : null
            maybeAdvanceWorkItem(store, {
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: review.workItemId,
                toStatus: nextStatus,
                reason: `review:${parsed.data.verdict ?? parsed.data.status ?? 'updated'}`
            })
            recomputeSwarmLifecycle(store, c.req.param('id'), c.get('namespace'))
            await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), c.get('namespace'))
            return c.json({ review })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/outcomes', (c) => {
        const outcomes = store.swarms.getSwarmOutcomes(c.req.param('id'), c.get('namespace'))
        return c.json({ outcomes })
    })

    app.post('/swarms/:id/outcomes', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addOutcomeSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const outcome = store.swarms.addSwarmOutcome({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                subjectId: parsed.data.subjectId,
                workItemId: parsed.data.workItemId,
                kind: parsed.data.kind,
                status: parsed.data.status,
                createdByParticipantId: parsed.data.createdByParticipantId,
                content: parsed.data.content,
                artifactRefs: parsed.data.artifactRefs
            })
            store.swarms.addSwarmActivity({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                subjectId: parsed.data.subjectId,
                workItemId: parsed.data.workItemId,
                kind: parsed.data.kind === 'decision' ? 'summarize' : parsed.data.kind === 'blocker' ? 'verify' : 'propose',
                status: parsed.data.status ?? 'open',
                participantId: parsed.data.createdByParticipantId,
                content: parsed.data.content
            })
            maybeAdvanceWorkItem(store, {
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: parsed.data.workItemId,
                toStatus: deriveWorkItemStatusFromOutcome(parsed.data.kind, parsed.data.status),
                reason: `outcome:${parsed.data.kind}`,
                byParticipantId: parsed.data.createdByParticipantId ?? null
            })
            recomputeSwarmLifecycle(store, c.req.param('id'), c.get('namespace'))
            await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), c.get('namespace'))
            return c.json({ outcome }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.patch('/swarms/:id/outcomes/:outcomeId', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateOutcomeSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const outcome = store.swarms.updateSwarmOutcome({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                outcomeId: c.req.param('outcomeId'),
                workItemId: parsed.data.workItemId,
                status: parsed.data.status,
                content: parsed.data.content,
                artifactRefs: parsed.data.artifactRefs
            })
            if (!outcome) {
                return c.json({ error: 'Outcome not found' }, 404)
            }
            return c.json({ outcome })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/work-items', (c) => {
        const workItems = store.swarms.getSwarmWorkItems(c.req.param('id'), c.get('namespace'))
        return c.json({ workItems })
    })

    app.post('/swarms/:id/work-items', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addWorkItemSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const workItem = store.swarms.addSwarmWorkItem({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                subjectId: parsed.data.subjectId,
                title: parsed.data.title,
                intent: parsed.data.intent,
                status: parsed.data.status,
                assignedParticipantId: parsed.data.assignedParticipantId,
                expectedArtifact: parsed.data.expectedArtifact,
                doneCriteria: parsed.data.doneCriteria
            })
            recomputeSwarmLifecycle(store, c.req.param('id'), c.get('namespace'))
            await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), c.get('namespace'))
            return c.json({ workItem }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.patch('/swarms/:id/work-items/:workItemId', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = updateWorkItemSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const existing = store.swarms.getSwarmWorkItemById(c.req.param('id'), c.get('namespace'), c.req.param('workItemId'))
            const workItem = store.swarms.updateSwarmWorkItem({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: c.req.param('workItemId'),
                title: parsed.data.title,
                intent: parsed.data.intent,
                status: parsed.data.status,
                assignedParticipantId: parsed.data.assignedParticipantId,
                expectedArtifact: parsed.data.expectedArtifact,
                doneCriteria: parsed.data.doneCriteria,
                lastDispatchAt: parsed.data.lastDispatchAt
            })
            if (!workItem) {
                return c.json({ error: 'Work item not found' }, 404)
            }
            if (parsed.data.status && existing && existing.status !== workItem.status) {
                store.swarms.addSwarmTransition({
                    swarmId: c.req.param('id'),
                    namespace: c.get('namespace'),
                    entityType: 'work_item',
                    entityId: workItem.id,
                    fromState: existing.status,
                    toState: workItem.status,
                    reason: 'manual-status-update'
                })
            }
            recomputeSwarmLifecycle(store, c.req.param('id'), c.get('namespace'))
            await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), c.get('namespace'))
            return c.json({ workItem })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/artifacts', (c) => {
        const artifacts = store.swarms.getSwarmArtifacts(c.req.param('id'), c.get('namespace'))
        return c.json({ artifacts })
    })

    app.post('/swarms/:id/artifacts', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addArtifactSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const workItem = parsed.data.workItemId
                ? store.swarms.getSwarmWorkItemById(c.req.param('id'), c.get('namespace'), parsed.data.workItemId)
                : null
            const assigneeContext = workItem?.assignedParticipantId
                ? buildRoleExecutionContext(getSwarmDetail(store, c.req.param('id'), c.get('namespace'))!, workItem.assignedParticipantId)
                : null
            const artifact = store.swarms.addSwarmArtifact({
                swarmId: c.req.param('id'),
                workItemId: parsed.data.workItemId,
                namespace: c.get('namespace'),
                kind: parsed.data.kind,
                title: parsed.data.title,
                content: parsed.data.content,
                url: parsed.data.url,
                status: parsed.data.status
            })
            store.swarms.addSwarmActivity({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: parsed.data.workItemId,
                kind: 'verify',
                status: parsed.data.status ?? 'open',
                content: {
                    artifactId: artifact.id,
                    kind: artifact.kind,
                    title: artifact.title
                }
            })
            maybeAdvanceWorkItem(store, {
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: parsed.data.workItemId,
                toStatus: deriveWorkItemStatusFromArtifactWithContract(parsed.data.status, assigneeContext?.outputContracts ?? []),
                reason: `artifact:${parsed.data.kind}`
            })
            recomputeSwarmLifecycle(store, c.req.param('id'), c.get('namespace'))
            return c.json({ artifact }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/swarms/:id/artifacts/from-report', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = createArtifactFromReportSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const namespace = c.get('namespace')
        const report = store.reports.getReportByNamespace(parsed.data.reportId, namespace)
        if (!report) {
            return c.json({ error: 'Report not found' }, 404)
        }
        try {
            const workItem = parsed.data.workItemId
                ? store.swarms.getSwarmWorkItemById(c.req.param('id'), namespace, parsed.data.workItemId)
                : null
            const detail = getSwarmDetail(store, c.req.param('id'), namespace)
            const assigneeContext = workItem?.assignedParticipantId && detail
                ? buildRoleExecutionContext(detail, workItem.assignedParticipantId)
                : null
            const artifact = store.swarms.addSwarmArtifact({
                swarmId: c.req.param('id'),
                workItemId: parsed.data.workItemId,
                namespace,
                kind: 'report',
                title: parsed.data.title ?? report.title,
                content: {
                    reportId: report.id,
                    reportStatus: report.status
                },
                url: `/api/reports/${encodeURIComponent(report.id)}`,
                status: report.status
            })
            store.swarms.addSwarmActivity({
                swarmId: c.req.param('id'),
                namespace,
                workItemId: parsed.data.workItemId,
                kind: 'summarize',
                status: report.status,
                content: {
                    reportId: report.id,
                    title: report.title
                }
            })
            maybeAdvanceWorkItem(store, {
                swarmId: c.req.param('id'),
                namespace,
                workItemId: parsed.data.workItemId,
                toStatus: deriveWorkItemStatusFromArtifactWithContract(report.status, assigneeContext?.outputContracts ?? []),
                reason: 'artifact:report'
            })
            await runSwarmAutomation(store, getSyncEngine, c.req.param('id'), namespace)
            return c.json({ artifact }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/swarms/:id/plan', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = autoPlanSchema.safeParse(body ?? {})
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const swarmId = c.req.param('id')
        const namespace = c.get('namespace')
        const detail = getSwarmDetail(store, swarmId, namespace)
        if (!detail) {
            return c.json({ error: 'Swarm not found' }, 404)
        }
        const summary = detail.subject?.summary?.trim()
        if (!summary) {
            return c.json({ error: 'Swarm subject is empty' }, 400)
        }
        const autonomyConfig = getPolicyConfig<{ autoPlanMaxItems?: number }>(detail, 'autonomy')
        const maxItems = Math.min(parsed.data.maxItems ?? 3, autonomyConfig.autoPlanMaxItems ?? 3)
        await withSwarmAutomationLock(swarmId, namespace, async () => {
            const lockedDetail = getSwarmDetail(store, swarmId, namespace)
            if (!lockedDetail) {
                return
            }
            await createSwarmAutoPlan(store, getSyncEngine, {
                swarmId,
                namespace,
                detail: lockedDetail,
                maxItems,
                dispatch: parsed.data.dispatch ?? false
            })
            recomputeSwarmLifecycle(store, swarmId, namespace)
            await applySwarmPolicies(store, getSyncEngine, swarmId, namespace)
            recomputeSwarmLifecycle(store, swarmId, namespace)
        })
        const latestDetail = getSwarmDetail(store, swarmId, namespace)
        return c.json({
            swarm: latestDetail
        }, 201)
    })

    app.get('/swarms/:id/events', (c) => {
        return c.json({ events: store.swarms.getSwarmEvents(c.req.param('id'), c.get('namespace')) })
    })

    app.get('/swarms/:id/effects', (c) => {
        return c.json({ effects: store.swarms.getSwarmEffects(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/effects', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addEffectSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const effect = store.swarms.addSwarmEffect({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                workItemId: parsed.data.workItemId,
                kind: parsed.data.kind,
                summary: parsed.data.summary,
                data: parsed.data.data,
                raw: parsed.data.raw
            })
            const subjectId = store.swarms.getSwarmSubject(c.req.param('id'), c.get('namespace'))?.id ?? null
            if (parsed.data.kind === 'file_change') {
                store.swarms.addSwarmActivity({
                    swarmId: c.req.param('id'),
                    namespace: c.get('namespace'),
                    subjectId,
                    workItemId: parsed.data.workItemId ?? null,
                    kind: 'implement',
                    status: 'completed',
                    content: {
                        source: 'effect:file_change',
                        effectId: effect.id,
                        summary: parsed.data.summary,
                        data: parsed.data.data
                    }
                })
            } else if (parsed.data.kind === 'delegation') {
                store.swarms.addSwarmActivity({
                    swarmId: c.req.param('id'),
                    namespace: c.get('namespace'),
                    subjectId,
                    workItemId: parsed.data.workItemId ?? null,
                    kind: 'coordinate',
                    status: 'completed',
                    content: {
                        source: 'effect:delegation',
                        effectId: effect.id,
                        summary: parsed.data.summary,
                        data: parsed.data.data
                    }
                })
            } else if (parsed.data.kind === 'permission') {
                store.swarms.addSwarmOutcome({
                    swarmId: c.req.param('id'),
                    namespace: c.get('namespace'),
                    subjectId,
                    workItemId: parsed.data.workItemId ?? null,
                    kind: 'question',
                    status: 'open',
                    content: {
                        source: 'effect:permission',
                        effectId: effect.id,
                        summary: parsed.data.summary,
                        data: parsed.data.data
                    }
                })
            }
            const event = store.swarms.addSwarmEvent({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                type: `tool-effect:${parsed.data.kind}`,
                payload: {
                    source: 'tool:record_effect',
                    effectId: effect.id,
                    workItemId: parsed.data.workItemId,
                    summary: parsed.data.summary,
                    data: parsed.data.data,
                    raw: parsed.data.raw
                }
            })
            return c.json({ effect, event }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/swarms/:id/transitions', (c) => {
        return c.json({ transitions: store.swarms.getSwarmTransitions(c.req.param('id'), c.get('namespace')) })
    })

    app.post('/swarms/:id/transitions', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addTransitionSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            const transition = store.swarms.addSwarmTransition({
                swarmId: c.req.param('id'),
                namespace: c.get('namespace'),
                entityType: parsed.data.entityType,
                entityId: parsed.data.entityId,
                fromState: parsed.data.fromState,
                toState: parsed.data.toState,
                reason: parsed.data.reason,
                byParticipantId: parsed.data.byParticipantId
            })
            return c.json({ transition }, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/swarms/:id/dispatch', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = dispatchSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const swarmId = c.req.param('id')
        const namespace = c.get('namespace')
        const detail = getSwarmDetail(store, swarmId, namespace)
        if (!detail) {
            return c.json({ error: 'Swarm not found' }, 404)
        }

        let participant = parsed.data.participantId
            ? detail.participants.find((item) => item.id === parsed.data.participantId) ?? null
            : null

        if (!participant && parsed.data.sessionId) {
            participant = detail.participants.find((item) => item.refId === parsed.data.sessionId) ?? null
        }

        if (!participant) {
            participant = await pickBestParticipantForDispatchWithSkills(store, detail, namespace, engine, {
                text: parsed.data.text,
                expectedArtifact: parsed.data.expectedArtifact,
                doneCriteria: parsed.data.doneCriteria,
                preferredSkillIds: getRoleProfilePreferredSkillIds(detail, 'implementer')
            })
        }

        if (!participant) {
            return c.json({ error: 'Participant not found' }, 404)
        }
        if (participant.kind !== 'agent' || !participant.refId) {
            return c.json({ error: 'Participant is not a session-backed agent' }, 400)
        }

        const session = store.sessions.getSessionByNamespace(participant.refId, namespace)
        if (!session) {
            return c.json({ error: 'Session not found' }, 404)
        }
        if (!session.active) {
            return c.json({ error: 'Session is inactive' }, 409)
        }

        const subjectSummary = detail.subject?.summary?.trim()
        const existingWorkItem = parsed.data.workItemId
            ? detail.workItems.find((item) => item.id === parsed.data.workItemId) ?? null
            : null
        const roleExecutionContext = buildRoleExecutionContext(detail, participant.id)
        const dispatchText = subjectSummary
            ? `[SWARM_CONTEXT]\nSwarm: ${detail.swarm.title}\nSwarm ID: ${swarmId}\nSubject: ${subjectSummary}\nSubject ID: ${detail.subject?.id ?? '—'}\nCurrent phase: ${detail.swarm.currentPhase}${existingWorkItem ? `\nWork item ID: ${existingWorkItem.id}` : ''}\n[/SWARM_CONTEXT]${buildRoleExecutionPromptBlocks(roleExecutionContext, { swarmId, subjectId: detail.subject?.id ?? null, workItemId: existingWorkItem?.id ?? null })}\n\n${parsed.data.text}`
            : parsed.data.text

        try {
            const dispatchAt = Date.now()
            const derivedTitle = parsed.data.title
                ?? parsed.data.text.split('\n').map((line) => line.trim()).find((line) => line.length > 0)?.slice(0, 120)
                ?? 'Swarm work item'
            const workItem = parsed.data.workItemId
                ? store.swarms.updateSwarmWorkItem({
                    swarmId,
                    namespace,
                    workItemId: parsed.data.workItemId,
                    title: parsed.data.title,
                    status: 'dispatched',
                    assignedParticipantId: participant.id,
                    expectedArtifact: parsed.data.expectedArtifact,
                    doneCriteria: parsed.data.doneCriteria,
                    lastDispatchAt: dispatchAt
                })
                : store.swarms.addSwarmWorkItem({
                    swarmId,
                    namespace,
                    subjectId: detail.subject?.id ?? null,
                    title: derivedTitle,
                    intent: parsed.data.text,
                    status: 'dispatched',
                    assignedParticipantId: participant.id,
                    expectedArtifact: parsed.data.expectedArtifact,
                    doneCriteria: parsed.data.doneCriteria,
                    lastDispatchAt: dispatchAt
                })

            if (!workItem) {
                return c.json({ error: 'Work item not found' }, 404)
            }

            store.swarms.releaseSwarmWorkItemAssignments({
                swarmId,
                workItemId: workItem.id,
                namespace,
                reason: 'dispatch-requested'
            })
            const assignment = store.swarms.addSwarmWorkItemAssignment({
                swarmId,
                workItemId: workItem.id,
                participantId: participant.id,
                namespace,
                status: 'active',
                reason: 'dispatch-requested'
            })
            store.swarms.upsertSwarmParticipantLease({
                swarmId,
                workItemId: workItem.id,
                participantId: participant.id,
                namespace,
                status: 'active',
                lastHeartbeatAt: dispatchAt,
                expiresAt: dispatchAt + 30 * 60 * 1000
            })

            await engine.sendMessage(participant.refId, {
                text: dispatchText,
                sentFrom: 'webapp',
                meta: {
                    swarmId,
                    participantId: participant.id,
                    swarmWorkItemId: workItem.id,
                    swarmRoles: roleExecutionContext.activeRoles,
                    swarmPreferredSkillIds: roleExecutionContext.preferredSkillIds,
                    swarmAllowedTools: roleExecutionContext.allowedTools,
                    swarmOutputContracts: roleExecutionContext.outputContracts
                }
            })
            store.swarms.addSwarmActivity({
                swarmId,
                namespace,
                subjectId: detail.subject?.id ?? null,
                workItemId: workItem.id,
                kind: 'coordinate',
                status: 'dispatched',
                participantId: participant.id,
                content: { text: parsed.data.text }
            })

            const outcome = store.swarms.addSwarmOutcome({
                swarmId,
                namespace,
                subjectId: detail.subject?.id ?? null,
                workItemId: workItem.id,
                kind: 'work_item',
                status: 'dispatched',
                createdByParticipantId: participant.id,
                content: {
                    workItemId: workItem.id,
                    workItemTitle: workItem.title,
                    targetSessionId: participant.refId,
                    text: parsed.data.text
                }
            })
            const event = store.swarms.addSwarmEvent({
                swarmId,
                namespace,
                type: 'dispatch-requested',
                payload: {
                    autoAssigned: !parsed.data.participantId && !parsed.data.sessionId,
                    participantId: participant.id,
                    sessionId: participant.refId,
                    assignmentId: assignment.id,
                    workItemId: workItem.id,
                    preview: parsed.data.text.slice(0, 280)
                }
            })
            const transition = store.swarms.addSwarmTransition({
                swarmId,
                namespace,
                entityType: 'participant',
                entityId: participant.id,
                fromState: participant.availability,
                toState: 'dispatched',
                reason: 'dispatch-requested',
                byParticipantId: participant.id
            })
            store.swarms.addSwarmTransition({
                swarmId,
                namespace,
                entityType: 'work_item',
                entityId: workItem.id,
                fromState: parsed.data.workItemId ? detail.workItems.find((item) => item.id === parsed.data.workItemId)?.status ?? null : 'open',
                toState: workItem.status,
                reason: 'dispatch-requested',
                byParticipantId: participant.id
            })
            await runSwarmAutomation(store, getSyncEngine, swarmId, namespace)

            return c.json({ ok: true, workItem, outcome, event, transition, participant, assignment })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/swarms/:id/broadcast', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const body = await c.req.json().catch(() => null)
        const parsed = broadcastSwarmSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const swarmId = c.req.param('id')
        const namespace = c.get('namespace')
        const detail = getSwarmDetail(store, swarmId, namespace)
        if (!detail) {
            return c.json({ error: 'Swarm not found' }, 404)
        }
        const group = store.groups.getGroupByNamespace(parsed.data.groupId, namespace)
        if (!group) {
            return c.json({ error: 'Group not found' }, 404)
        }
        const openCount = detail.workItems.filter((item) => !['completed', 'canceled'].includes(item.status)).length
        const blockedCount = detail.workItems.filter((item) => item.status === 'blocked').length
        const text = parsed.data.text?.trim() || `Swarm update: ${detail.swarm.title}`
        const payload = {
            text: `🐝 **Swarm Broadcast**\n\n**Swarm**: ${detail.swarm.title}\n**Phase**: ${detail.swarm.currentPhase}\n**Status**: ${detail.swarm.status}\n**Subject**: ${detail.subject?.summary ?? '—'}\n**Open Work Items**: ${openCount}\n**Blocked**: ${blockedCount}\n\n${text}`
        }
        try {
            const result = await engine.addGroupMessage({
                groupId: group.id,
                namespace,
                type: 'system',
                payload,
                source: 'swarm'
            })
            return c.json(result, 201)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    return app
}
