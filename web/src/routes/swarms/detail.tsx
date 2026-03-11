import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { useGroups } from '@/hooks/queries/useGroups'
import { useReports } from '@/hooks/queries/useReports'
import { useSwarm } from '@/hooks/queries/useSwarm'
import { useSwarmSkills } from '@/hooks/queries/useSwarmSkills'
import { useSessions } from '@/hooks/queries/useSessions'
import { SwarmHeaderPanel } from '@/components/swarms/SwarmHeaderPanel'
import { SwarmPoliciesPanel } from '@/components/swarms/SwarmPoliciesPanel'
import { SwarmRoleProfilesPanel } from '@/components/swarms/SwarmRoleProfilesPanel'

function formatTime(value: number): string {
    try {
        return new Date(value).toLocaleString()
    } catch {
        return `${value}`
    }
}

function prettyJson(value: unknown): string {
    if (value == null) {
        return '—'
    }
    if (typeof value === 'string') {
        return value
    }
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

type TimelineEntry = {
    id: string
    kind: string
    title: string
    subtitle?: string
    body?: string
    at: number
}

type SwarmTab = 'overview' | 'plan' | 'execute' | 'decide' | 'history'

const pageCardClass = 'rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm'
const softPanelClass = 'rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/65 p-3'
const inputClass = 'w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm text-[var(--app-fg)] outline-none transition-colors focus:border-[var(--app-link)]'
const subtleButtonClass = 'rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:opacity-60'
const primaryButtonClass = 'rounded-xl bg-[var(--app-link)] px-3 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60'
const sectionTitleClass = 'text-sm font-semibold text-[var(--app-fg)]'
const workbenchSidebarClass = 'lg:sticky lg:top-24 self-start'

function getStateBadgeClass(value: string): string {
    if (value === 'completed' || value === 'approved' || value === 'online') return 'bg-emerald-50 text-emerald-700'
    if (value === 'blocked' || value === 'failed' || value === 'changes_requested' || value === 'offline') return 'bg-rose-50 text-rose-700'
    if (value === 'active' || value === 'running' || value === 'dispatched') return 'bg-sky-50 text-sky-700'
    return 'bg-slate-100 text-slate-700'
}

export default function SwarmDetailPage() {
    const { swarmId } = useParams({ from: '/swarms/$swarmId' })
    const { api } = useAppContext()
    const { swarm, isLoading, error, refetch } = useSwarm(api, swarmId)
    const { sessions } = useSessions(api)
    const { groups } = useGroups(api)
    const { reports } = useReports(api)
    const { skills: swarmSkills } = useSwarmSkills(api, swarmId)
    const [activeTab, setActiveTab] = useState<SwarmTab>('overview')
    const [selectedSessionId, setSelectedSessionId] = useState('')
    const [subjectSummary, setSubjectSummary] = useState('')
    const [outcomeKind, setOutcomeKind] = useState('summary')
    const [outcomeWorkItemId, setOutcomeWorkItemId] = useState('')
    const [outcomeContent, setOutcomeContent] = useState('')
    const [workItemTitle, setWorkItemTitle] = useState('')
    const [workItemIntent, setWorkItemIntent] = useState('')
    const [workItemExpectedArtifact, setWorkItemExpectedArtifact] = useState('')
    const [workItemDoneCriteria, setWorkItemDoneCriteria] = useState('')
    const [activityKind, setActivityKind] = useState('coordinate')
    const [activityContent, setActivityContent] = useState('')
    const [roleParticipantId, setRoleParticipantId] = useState('')
    const [roleName, setRoleName] = useState('leader')
    const [threadTitle, setThreadTitle] = useState('')
    const [selectedThreadId, setSelectedThreadId] = useState('')
    const [threadEntryKind, setThreadEntryKind] = useState('proposal')
    const [threadEntryContent, setThreadEntryContent] = useState('')
    const [policyKind, setPolicyKind] = useState('escalation')
    const [roleProfileRole, setRoleProfileRole] = useState('planner')
    const [roleProfileInstruction, setRoleProfileInstruction] = useState('')
    const [roleProfileSkills, setRoleProfileSkills] = useState('')
    const [roleProfileTools, setRoleProfileTools] = useState('')
    const [roleProfileOutputContract, setRoleProfileOutputContract] = useState('')
    const [reviewArtifactId, setReviewArtifactId] = useState('')
    const [reviewVerdict, setReviewVerdict] = useState('approved')
    const [reviewSummary, setReviewSummary] = useState('')
    const [artifactKind, setArtifactKind] = useState('report')
    const [artifactWorkItemId, setArtifactWorkItemId] = useState('')
    const [artifactTitle, setArtifactTitle] = useState('')
    const [artifactUrl, setArtifactUrl] = useState('')
    const [reportArtifactId, setReportArtifactId] = useState('')
    const [dispatchTargetId, setDispatchTargetId] = useState('')
    const [dispatchWorkItemId, setDispatchWorkItemId] = useState('')
    const [dispatchText, setDispatchText] = useState('')
    const [broadcastGroupId, setBroadcastGroupId] = useState('')
    const [broadcastText, setBroadcastText] = useState('')
    const [selectedWorkItemId, setSelectedWorkItemId] = useState('')
    const [policyDrafts, setPolicyDrafts] = useState<Record<string, string>>({})
    const [roleProfileDrafts, setRoleProfileDrafts] = useState<Record<string, {
        instructionText: string
        preferredSkillIds: string
        allowedTools: string
        outputContract: string
    }>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (isLoading) {
        return <div className="p-4 text-sm text-[var(--app-hint)]">Loading swarm...</div>
    }

    if (error) {
        return <div className="p-4 text-sm text-red-600">{error}</div>
    }

    if (!swarm) {
        return <div className="p-4 text-sm text-[var(--app-hint)]">Swarm not found.</div>
    }

    const timelineEntries: TimelineEntry[] = [
        ...swarm.workItems.map((workItem) => ({
            id: `work-item:${workItem.id}:${workItem.updatedAt}`,
            kind: 'work-item',
            title: workItem.title,
            subtitle: workItem.status,
            body: workItem.intent ?? undefined,
            at: workItem.updatedAt
        })),
        ...swarm.outcomes.map((outcome) => ({
            id: `outcome:${outcome.id}:${outcome.updatedAt}`,
            kind: 'outcome',
            title: outcome.kind,
            subtitle: outcome.status,
            body: typeof outcome.content === 'string' ? outcome.content : prettyJson(outcome.content),
            at: outcome.updatedAt
        })),
        ...swarm.artifacts.map((artifact) => ({
            id: `artifact:${artifact.id}:${artifact.updatedAt}`,
            kind: 'artifact',
            title: artifact.title,
            subtitle: artifact.status,
            body: artifact.url ?? undefined,
            at: artifact.updatedAt
        })),
        ...swarm.transitions.map((transition) => ({
            id: `transition:${transition.id}`,
            kind: 'transition',
            title: `${transition.entityType} → ${transition.toState}`,
            subtitle: transition.fromState ? `${transition.fromState} → ${transition.toState}` : transition.toState,
            body: transition.reason ?? undefined,
            at: transition.createdAt
        })),
        ...swarm.effects.map((effect) => ({
            id: `effect:${effect.id}`,
            kind: 'effect',
            title: effect.kind,
            subtitle: effect.workItemId ?? undefined,
            body: effect.summary ?? (effect.data ? prettyJson(effect.data) : undefined),
            at: effect.createdAt
        })),
        ...swarm.events.map((event) => ({
            id: `event:${event.id}`,
            kind: 'event',
            title: event.type,
            body: event.payload ? prettyJson(event.payload) : undefined,
            at: event.createdAt
        }))
    ].sort((a, b) => b.at - a.at)

    const availableSessions = sessions.filter((session) =>
        !swarm.participants.some((participant) => participant.refId === session.id)
    )
    const selectedWorkItem = swarm.workItems.find((item) => item.id === selectedWorkItemId) ?? swarm.workItems[0] ?? null
    const selectedWorkItemOutcomes = selectedWorkItem
        ? swarm.outcomes.filter((item) => item.workItemId === selectedWorkItem.id)
        : []
    const selectedWorkItemArtifacts = selectedWorkItem
        ? swarm.artifacts.filter((item) => item.workItemId === selectedWorkItem.id)
        : []
    const selectedWorkItemTransitions = selectedWorkItem
        ? swarm.transitions.filter((item) => item.entityType === 'work_item' && item.entityId === selectedWorkItem.id)
        : []
    const selectedWorkItemEvents = selectedWorkItem
        ? swarm.events.filter((item) => {
            const payload = item.payload && typeof item.payload === 'object' ? item.payload as Record<string, unknown> : null
            return payload?.workItemId === selectedWorkItem.id
        })
        : []
    const selectedWorkItemReviews = selectedWorkItem
        ? swarm.reviews.filter((item) => item.workItemId === selectedWorkItem.id)
        : []
    const selectedThread = swarm.threads.find((item) => item.id === selectedThreadId) ?? swarm.threads[0] ?? null
    const selectedThreadEntries = selectedThread
        ? swarm.threadEntries.filter((item) => item.threadId === selectedThread.id)
        : []
    const selectedWorkItemAssignments = selectedWorkItem
        ? swarm.assignments.filter((item) => item.workItemId === selectedWorkItem.id)
        : []
    const selectedWorkItemLeases = selectedWorkItem
        ? swarm.leases.filter((item) => item.workItemId === selectedWorkItem.id)
        : []
    const decisionOutcomes = swarm.outcomes.filter((item) => ['proposal', 'decision', 'blocker', 'summary'].includes(item.kind))
    const autonomyPausedEvents = swarm.events.filter((item) => item.type === 'autonomy-paused')
    const autoDispatchEvents = swarm.events.filter((item) => item.type === 'auto-dispatch-requested')
    const autoReassignEvents = swarm.events.filter((item) => item.type === 'work-item-reassigned')
    const autonomyPolicy = swarm.policies.find((item) => item.kind === 'autonomy') ?? null
    const latestAutonomyPaused = autonomyPausedEvents[0] ?? null
    const sessionParticipants = swarm.participants.filter((participant) => participant.kind === 'agent' && participant.refId)
    const blockedWorkItems = swarm.workItems.filter((item) => item.status === 'blocked')
    const openWorkItems = swarm.workItems.filter((item) => ['open', 'active', 'dispatched', 'running'].includes(item.status))
    const reviewQueue = swarm.workItems.filter((item) => ['dispatched', 'running'].includes(item.status))

    const prioritizedWorkItems = [
        ...swarm.workItems.filter((item) => item.status === 'blocked'),
        ...swarm.workItems.filter((item) => ['running', 'dispatched'].includes(item.status)),
        ...swarm.workItems.filter((item) => ['active', 'open'].includes(item.status)),
        ...swarm.workItems.filter((item) => ['completed', 'canceled'].includes(item.status))
    ].filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
    const selectedWorkItemIndex = prioritizedWorkItems.findIndex((item) => item.id === selectedWorkItem?.id)
    const previousWorkItem = selectedWorkItemIndex > 0 ? prioritizedWorkItems[selectedWorkItemIndex - 1] : null
    const nextWorkItem = selectedWorkItemIndex >= 0 && selectedWorkItemIndex < prioritizedWorkItems.length - 1 ? prioritizedWorkItems[selectedWorkItemIndex + 1] : null

    const navItems: Array<{ id: SwarmTab, label: string, hint: string }> = [
        { id: 'overview', label: 'Overview', hint: 'health + next steps' },
        { id: 'plan', label: 'Plan', hint: 'work items' },
        { id: 'execute', label: 'Execute', hint: 'people + actions' },
        { id: 'decide', label: 'Decide', hint: 'reviews + outcomes' },
        { id: 'history', label: 'History', hint: 'timeline + logs' }
    ]

    const handleAddSessionParticipant = async () => {
        if (!api || !selectedSessionId) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmParticipant(swarmId, {
                kind: 'agent',
                refId: selectedSessionId
            })
            setSelectedSessionId('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleUpdateSubject = async () => {
        if (!api || !subjectSummary.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.updateSwarmSubject(swarmId, {
                summary: subjectSummary.trim(),
                kind: swarm.subject?.kind ?? 'goal',
                successCriteria: swarm.subject?.successCriteria ?? null,
                status: swarm.subject?.status ?? 'open',
                constraints: swarm.subject?.constraints ?? undefined
            })
            setSubjectSummary('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddOutcome = async () => {
        if (!api || !outcomeContent.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmOutcome(swarmId, {
                subjectId: swarm.subject?.id,
                workItemId: outcomeWorkItemId || undefined,
                kind: outcomeKind,
                content: outcomeContent.trim(),
                status: 'open'
            })
            setOutcomeWorkItemId('')
            setOutcomeContent('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddArtifact = async () => {
        if (!api || !artifactTitle.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmArtifact(swarmId, {
                workItemId: artifactWorkItemId || undefined,
                kind: artifactKind,
                title: artifactTitle.trim(),
                url: artifactUrl.trim() || undefined,
                status: 'draft'
            })
            setArtifactWorkItemId('')
            setArtifactTitle('')
            setArtifactUrl('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddReportArtifact = async () => {
        if (!api || !reportArtifactId.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmArtifactFromReport(swarmId, {
                reportId: reportArtifactId.trim(),
                workItemId: artifactWorkItemId || undefined
            })
            setReportArtifactId('')
            setArtifactWorkItemId('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddWorkItem = async () => {
        if (!api || !workItemTitle.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmWorkItem(swarmId, {
                subjectId: swarm.subject?.id,
                title: workItemTitle.trim(),
                intent: workItemIntent.trim() || undefined,
                expectedArtifact: workItemExpectedArtifact.trim() || undefined,
                doneCriteria: workItemDoneCriteria.trim() || undefined,
                status: 'open'
            })
            setWorkItemTitle('')
            setWorkItemIntent('')
            setWorkItemExpectedArtifact('')
            setWorkItemDoneCriteria('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddActivity = async () => {
        if (!api || !activityKind.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmActivity(swarmId, {
                subjectId: swarm.subject?.id,
                workItemId: selectedWorkItem?.id,
                kind: activityKind,
                participantId: roleParticipantId || undefined,
                content: activityContent.trim() || undefined,
                status: 'open'
            })
            setActivityContent('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddRoleBinding = async () => {
        if (!api || !roleParticipantId || !roleName.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmRoleBinding(swarmId, {
                participantId: roleParticipantId,
                role: roleName.trim(),
                phase: swarm.swarm.currentPhase,
                status: 'active'
            })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddRoleProfile = async () => {
        if (!api || !roleProfileRole.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmRoleProfile(swarmId, {
                role: roleProfileRole.trim(),
                instructionText: roleProfileInstruction.trim() || null,
                preferredSkillIds: roleProfileSkills.split(',').map((item) => item.trim()).filter(Boolean),
                allowedTools: roleProfileTools.split(',').map((item) => item.trim()).filter(Boolean),
                outputContract: roleProfileOutputContract.trim() || null
            })
            setRoleProfileInstruction('')
            setRoleProfileSkills('')
            setRoleProfileTools('')
            setRoleProfileOutputContract('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const getRoleProfileDraft = (profile: typeof swarm.roleProfiles[number]) => roleProfileDrafts[profile.id] ?? {
        instructionText: profile.instructionText ?? '',
        preferredSkillIds: (profile.preferredSkillIds ?? []).join(', '),
        allowedTools: (profile.allowedTools ?? []).join(', '),
        outputContract: profile.outputContract ?? ''
    }

    const appendSkillName = (current: string, skillName: string) => {
        const parts = current.split(',').map((item) => item.trim()).filter(Boolean)
        if (!parts.includes(skillName)) {
            parts.push(skillName)
        }
        return parts.join(', ')
    }

    const handleRoleProfileDraftChange = (
        roleProfileId: string,
        field: 'instructionText' | 'preferredSkillIds' | 'allowedTools' | 'outputContract',
        value: string,
        profile: typeof swarm.roleProfiles[number]
    ) => {
        const current = getRoleProfileDraft(profile)
        setRoleProfileDrafts((drafts) => ({
            ...drafts,
            [roleProfileId]: {
                ...current,
                [field]: value
            }
        }))
    }

    const handleSaveRoleProfile = async (roleProfileId: string, profile: typeof swarm.roleProfiles[number]) => {
        if (!api) {
            return
        }
        const draft = getRoleProfileDraft(profile)
        setIsSubmitting(true)
        try {
            await api.updateSwarmRoleProfile(swarmId, roleProfileId, {
                instructionText: draft.instructionText.trim() || null,
                preferredSkillIds: draft.preferredSkillIds.split(',').map((item) => item.trim()).filter(Boolean),
                allowedTools: draft.allowedTools.split(',').map((item) => item.trim()).filter(Boolean),
                outputContract: draft.outputContract.trim() || null
            })
            setRoleProfileDrafts((drafts) => {
                const next = { ...drafts }
                delete next[roleProfileId]
                return next
            })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddThread = async () => {
        if (!api || !threadTitle.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmThread(swarmId, {
                title: threadTitle.trim(),
                kind: 'discussion',
                status: 'open',
                summary: selectedWorkItem ? `Linked work item: ${selectedWorkItem.title}` : undefined
            })
            setThreadTitle('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddThreadEntry = async () => {
        if (!api || !selectedThread || !threadEntryKind.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmThreadEntry(swarmId, {
                threadId: selectedThread.id,
                kind: threadEntryKind.trim(),
                content: threadEntryContent.trim() || undefined
            })
            setThreadEntryContent('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAutoPlan = async (dispatch: boolean) => {
        if (!api) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.autoPlanSwarm(swarmId, {
                dispatch,
                maxItems: 3
            })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleSynthesizeThread = async (asDecision: boolean) => {
        if (!api || !selectedThread) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.synthesizeSwarmThread(swarmId, selectedThread.id, {
                asDecision
            })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddPolicy = async () => {
        if (!api || !policyKind.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmPolicy(swarmId, {
                kind: policyKind.trim(),
                status: 'active',
                config: { phase: swarm.swarm.currentPhase }
            })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleTogglePolicy = async (policyId: string, currentStatus: string) => {
        if (!api) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.updateSwarmPolicy(swarmId, policyId, {
                status: currentStatus === 'disabled' ? 'active' : 'disabled'
            })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleRunPolicies = async () => {
        if (!api) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.runSwarmPolicies(swarmId, { force: true })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const getPolicyDraft = (policyId: string, config: unknown) => policyDrafts[policyId] ?? prettyJson(config)

    const handlePolicyDraftChange = (policyId: string, value: string) => {
        setPolicyDrafts((current) => ({
            ...current,
            [policyId]: value
        }))
    }

    const handleSavePolicyConfig = async (policyId: string, currentConfig: unknown) => {
        if (!api) {
            return
        }
        const raw = getPolicyDraft(policyId, currentConfig).trim()
        let parsed: unknown = null
        try {
            parsed = raw ? JSON.parse(raw) : null
        } catch {
            return
        }
        setIsSubmitting(true)
        try {
            await api.updateSwarmPolicy(swarmId, policyId, {
                config: parsed
            })
            setPolicyDrafts((current) => {
                const next = { ...current }
                delete next[policyId]
                return next
            })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAddReview = async () => {
        if (!api) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.addSwarmReview(swarmId, {
                workItemId: selectedWorkItem?.id,
                artifactId: reviewArtifactId || undefined,
                status: 'completed',
                verdict: reviewVerdict,
                summary: reviewSummary.trim() || undefined
            })
            setReviewArtifactId('')
            setReviewSummary('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDispatch = async () => {
        if (!api || !dispatchText.trim()) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.dispatchSwarmWork(swarmId, {
                participantId: dispatchTargetId || undefined,
                workItemId: dispatchWorkItemId || undefined,
                text: dispatchText.trim()
            })
            setDispatchTargetId('')
            setDispatchWorkItemId('')
            setDispatchText('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleUpdateWorkItemStatus = async (workItemId: string, status: string) => {
        if (!api) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.updateSwarmWorkItem(swarmId, workItemId, { status })
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleBroadcast = async () => {
        if (!api || !broadcastGroupId) {
            return
        }
        setIsSubmitting(true)
        try {
            await api.broadcastSwarm(swarmId, {
                groupId: broadcastGroupId,
                text: broadcastText.trim() || undefined
            })
            setBroadcastText('')
            await refetch()
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="h-full overflow-y-auto bg-[var(--app-bg)]">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
                <SwarmHeaderPanel
                    title={swarm.swarm.title}
                    phase={swarm.swarm.currentPhase}
                    status={swarm.swarm.status}
                    updatedAtLabel={formatTime(swarm.swarm.updatedAt)}
                    autoDispatchCount={autoDispatchEvents.length}
                    reassignmentsCount={autoReassignEvents.length}
                    autonomyPausedCount={autonomyPausedEvents.length}
                    autonomyPausedReason={latestAutonomyPaused
                        ? (() => {
                            const payload = latestAutonomyPaused.payload && typeof latestAutonomyPaused.payload === 'object'
                                ? latestAutonomyPaused.payload as Record<string, unknown>
                                : null
                            return typeof payload?.reason === 'string' ? payload.reason : 'unknown'
                        })()
                        : null}
                    canToggleAutonomy={Boolean(autonomyPolicy)}
                    autonomyEnabled={autonomyPolicy?.status !== 'disabled'}
                    isSubmitting={isSubmitting}
                    onAutoPlan={(dispatch) => { void handleAutoPlan(dispatch) }}
                    onRunPolicies={() => { void handleRunPolicies() }}
                    onToggleAutonomy={() => {
                        if (autonomyPolicy) {
                            void handleTogglePolicy(autonomyPolicy.id, autonomyPolicy.status)
                        }
                    }}
                />

                <nav className="sticky top-0 z-10 -mx-1 overflow-x-auto rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)]/95 px-1 py-1 shadow-sm backdrop-blur">
                    <div className="flex min-w-max gap-1">
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveTab(item.id)}
                                className={`flex min-w-[132px] flex-col rounded-xl px-3 py-2 text-left transition-colors ${activeTab === item.id ? 'bg-[var(--app-link)] text-white shadow-sm' : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'}`}
                            >
                                <span className="text-sm font-medium">{item.label}</span>
                                <span className={`text-[11px] ${activeTab === item.id ? 'text-white/80' : 'text-[var(--app-hint)]'}`}>{item.hint}</span>
                            </button>
                        ))}
                    </div>
                </nav>

                {activeTab === 'overview' ? (
                    <div className="grid gap-4">
                        <section className={pageCardClass}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className={sectionTitleClass}>Quick guide</div>
                                    <div className="mt-1 text-xs text-[var(--app-hint)]">Use the tabs in order when you are not sure where to start.</div>
                                </div>
                                <div className="rounded-full bg-[var(--app-secondary-bg)] px-3 py-1 text-xs text-[var(--app-hint)]">
                                    Overview → Plan → Execute → Decide → History
                                </div>
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-4">
                                {[
                                    ['Overview', 'Understand mission health and the next recommended step.'],
                                    ['Plan', 'Break the mission into small, assignable work items.'],
                                    ['Execute', 'Assign work, report progress, and coordinate participants.'],
                                    ['Decide', 'Review outputs, approve work, and resolve blockers.']
                                ].map(([title, copy]) => (
                                    <div key={title} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 p-3">
                                        <div className="text-sm font-medium text-[var(--app-fg)]">{title}</div>
                                        <div className="mt-1 text-xs leading-5 text-[var(--app-hint)]">{copy}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="grid gap-4 md:grid-cols-4">
                            <div className={`${pageCardClass} md:col-span-2`}>
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">Mission summary</div>
                                <div className="mt-2 text-sm leading-6 text-[var(--app-fg)]">{swarm.subject?.summary ?? 'No subject summary yet.'}</div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                    <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[var(--app-hint)]">participants {swarm.participants.length}</span>
                                    <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[var(--app-hint)]">open work {openWorkItems.length}</span>
                                    <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[var(--app-hint)]">blocked {blockedWorkItems.length}</span>
                                    <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[var(--app-hint)]">outcomes {swarm.outcomes.length}</span>
                                </div>
                            </div>
                            <div className={pageCardClass}>
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">Now working on</div>
                                <div className="mt-2 text-sm font-medium text-[var(--app-fg)]">{selectedWorkItem?.title ?? 'Nothing selected'}</div>
                                <div className="mt-2">
                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getStateBadgeClass(selectedWorkItem?.status ?? 'unknown')}`}>{selectedWorkItem?.status ?? 'idle'}</span>
                                </div>
                            </div>
                            <div className={pageCardClass}>
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">Latest signal</div>
                                <div className="mt-2 text-sm font-medium text-[var(--app-fg)]">{timelineEntries[0]?.title ?? 'No timeline yet'}</div>
                                <div className="mt-1 text-xs text-[var(--app-hint)]">{timelineEntries[0] ? formatTime(timelineEntries[0].at) : '—'}</div>
                            </div>
                        </section>

                        <section className={pageCardClass}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className={sectionTitleClass}>Recommended next actions</div>
                                    <div className="mt-1 text-xs text-[var(--app-hint)]">Drive from goal → plan → execution → review.</div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setActiveTab('plan')} className={subtleButtonClass}>Open plan</button>
                                    <button type="button" onClick={() => setActiveTab('execute')} className={subtleButtonClass}>Assign work</button>
                                    <button type="button" onClick={() => setActiveTab('decide')} className={subtleButtonClass}>Review outcomes</button>
                                </div>
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                                <div className={softPanelClass}>
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">Needs planning</div>
                                    <div className="mt-2 text-2xl font-semibold text-[var(--app-fg)]">{swarm.workItems.length === 0 ? 1 : 0}</div>
                                    <div className="mt-1 text-xs text-[var(--app-hint)]">{swarm.workItems.length === 0 ? 'No work items yet.' : 'Plan exists.'}</div>
                                </div>
                                <div className={softPanelClass}>
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">Needs action</div>
                                    <div className="mt-2 text-2xl font-semibold text-[var(--app-fg)]">{openWorkItems.length}</div>
                                    <div className="mt-1 text-xs text-[var(--app-hint)]">Open or active items waiting for movement.</div>
                                </div>
                                <div className={softPanelClass}>
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">Needs attention</div>
                                    <div className="mt-2 text-2xl font-semibold text-[var(--app-fg)]">{blockedWorkItems.length + autonomyPausedEvents.length}</div>
                                    <div className="mt-1 text-xs text-[var(--app-hint)]">Blocked work and autonomy pauses.</div>
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className={pageCardClass}>
                                <div className={sectionTitleClass}>Mission brief</div>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <div className={softPanelClass}>
                                        <div className="mb-2 text-sm font-semibold text-[var(--app-fg)]">Subject</div>
                                        {swarm.subject ? (
                                            <div className="space-y-2 text-sm">
                                                <div><span className="text-[var(--app-hint)]">kind:</span> {swarm.subject.kind}</div>
                                                <div><span className="text-[var(--app-hint)]">summary:</span> {swarm.subject.summary}</div>
                                                <div><span className="text-[var(--app-hint)]">success:</span> {swarm.subject.successCriteria ?? '—'}</div>
                                                <div><span className="text-[var(--app-hint)]">status:</span> {swarm.subject.status}</div>
                                            </div>
                                        ) : <div className="text-sm text-[var(--app-hint)]">No subject yet.</div>}
                                        <div className="mt-3 flex gap-2">
                                            <input value={subjectSummary} onChange={(event) => setSubjectSummary(event.target.value)} placeholder="Update subject summary" className={`min-w-0 flex-1 ${inputClass}`} />
                                            <button type="button" onClick={() => { void handleUpdateSubject() }} disabled={isSubmitting || !subjectSummary.trim()} className={primaryButtonClass}>Save</button>
                                        </div>
                                    </div>
                                    <div className={softPanelClass}>
                                        <div className="mb-2 text-sm font-semibold text-[var(--app-fg)]">Participants</div>
                                        {swarm.participants.length > 0 ? (
                                            <div className="space-y-2 text-sm">
                                                {swarm.participants.slice(0, 4).map((participant) => (
                                                    <div key={participant.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5">
                                                        <div className="font-medium text-[var(--app-fg)]">{participant.kind} {participant.refId ? `· ${participant.refId}` : ''}</div>
                                                        <div className="text-xs text-[var(--app-hint)]">{participant.provider ?? 'local'} {participant.model ? `· ${participant.model}` : ''}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : <div className="text-sm text-[var(--app-hint)]">No participants yet.</div>}
                                        <button type="button" onClick={() => setActiveTab('execute')} className="mt-3 text-sm text-[var(--app-link)] underline">Manage participants and dispatch</button>
                                    </div>
                                </div>
                            </div>
                            <div className={pageCardClass}>
                                <div className={sectionTitleClass}>Decision queue</div>
                                <div className="mt-1 text-xs text-[var(--app-hint)]">High-signal decisions and blockers.</div>
                                <div className="mt-4 space-y-3">
                                    {decisionOutcomes.slice(0, 4).map((item) => (
                                        <div key={item.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/65 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-medium text-[var(--app-fg)]">{item.kind}</div>
                                                <div className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStateBadgeClass(item.status)}`}>{item.status}</div>
                                            </div>
                                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--app-fg)]">{prettyJson(item.content)}</pre>
                                        </div>
                                    ))}
                                    {decisionOutcomes.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">No proposals, decisions, or blockers yet.</div> : null}
                                </div>
                            </div>
                        </section>
                    </div>
                ) : null}

                {activeTab === 'plan' ? (
                    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                        <div className={`grid gap-4 ${workbenchSidebarClass}`}>
                            <section className={pageCardClass}>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div>
                                        <div className={sectionTitleClass}>Current plan queue</div>
                                        <div className="text-xs text-[var(--app-hint)]">Left rail = choose the task. Right rail = move it forward.</div>
                                    </div>
                                    <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-hint)]">{swarm.workItems.length} items</span>
                                </div>
                                <div className="mb-3 grid gap-2 grid-cols-2 text-xs">
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2 text-[var(--app-hint)]">blocked {blockedWorkItems.length}</div>
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2 text-[var(--app-hint)]">active {openWorkItems.length}</div>
                                </div>
                                {prioritizedWorkItems.length > 0 ? (
                                    <div className="space-y-3">
                                        {prioritizedWorkItems.map((workItem) => (
                                            <button
                                                key={workItem.id}
                                                type="button"
                                                onClick={() => setSelectedWorkItemId(workItem.id)}
                                                className={`block w-full rounded-2xl border p-3 text-left transition-all ${selectedWorkItem?.id === workItem.id ? 'border-[var(--app-link)] bg-[var(--app-subtle-bg)] shadow-sm' : 'border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 hover:border-[var(--app-link)]/30 hover:bg-[var(--app-subtle-bg)]'}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-medium text-[var(--app-fg)]">{workItem.title}</div>
                                                    <div className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStateBadgeClass(workItem.status)}`}>{workItem.status}</div>
                                                </div>
                                                <div className="mt-1 text-xs text-[var(--app-hint)]">assigned {workItem.assignedParticipantId ?? '—'} · updated {formatTime(workItem.updatedAt)}</div>
                                                {workItem.intent ? <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--app-fg)]">{workItem.intent}</div> : null}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">
                                        <div className="font-medium text-[var(--app-fg)]">No work items yet.</div>
                                        <div className="mt-1">Start by creating 3–5 small tasks, or auto-plan from the mission goal.</div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button type="button" onClick={() => { void handleAutoPlan(false) }} disabled={isSubmitting} className={subtleButtonClass}>
                                                Auto plan
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>

                            <section className={pageCardClass}>
                                <div className="text-sm font-semibold text-[var(--app-fg)]">Create work item</div>
                                <div className="mt-1 text-xs text-[var(--app-hint)]">Define what should be done, what output should come back, and how you will know it is done.</div>
                                <div className={`${softPanelClass} mt-3 space-y-2`}>
                                    <input value={workItemTitle} onChange={(event) => setWorkItemTitle(event.target.value)} placeholder="Title" className={inputClass} />
                                    <textarea value={workItemIntent} onChange={(event) => setWorkItemIntent(event.target.value)} placeholder="Intent / task body" className={`min-h-24 ${inputClass}`} />
                                    <input value={workItemExpectedArtifact} onChange={(event) => setWorkItemExpectedArtifact(event.target.value)} placeholder="Expected artifact" className={inputClass} />
                                    <div className="flex gap-2">
                                        <input value={workItemDoneCriteria} onChange={(event) => setWorkItemDoneCriteria(event.target.value)} placeholder="Done criteria" className={`min-w-0 flex-1 ${inputClass}`} />
                                        <button type="button" onClick={() => { void handleAddWorkItem() }} disabled={isSubmitting || !workItemTitle.trim()} className={primaryButtonClass}>Create</button>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="grid gap-4">
                            <section className={pageCardClass}>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div>
                                        <div className={sectionTitleClass}>Selected work item</div>
                                        <div className="text-xs text-[var(--app-hint)]">Task detail, assignment, and evidence in one place.</div>
                                    </div>
                                    {selectedWorkItem ? (
                                        <select value={selectedWorkItem.status} onChange={(event) => { void handleUpdateWorkItemStatus(selectedWorkItem.id, event.target.value) }} disabled={isSubmitting} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--app-link)]">
                                            <option value="open">open</option>
                                            <option value="active">active</option>
                                            <option value="dispatched">dispatched</option>
                                            <option value="running">running</option>
                                            <option value="blocked">blocked</option>
                                            <option value="completed">completed</option>
                                            <option value="canceled">canceled</option>
                                        </select>
                                    ) : null}
                                </div>
                                {selectedWorkItem ? (
                                    <div className="space-y-3">
                                        <div className={softPanelClass}>
                                            <div className="font-medium text-[var(--app-fg)]">{selectedWorkItem.title}</div>
                                            <div className="mt-1 text-xs text-[var(--app-hint)]">assigned {selectedWorkItem.assignedParticipantId ?? '—'}</div>
                                            {selectedWorkItem.intent ? <div className="mt-3 whitespace-pre-wrap text-sm text-[var(--app-fg)]">{selectedWorkItem.intent}</div> : null}
                                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                                                <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                    <div className="font-medium text-[var(--app-fg)]">Expected artifact</div>
                                                    <div className="mt-1 text-[var(--app-hint)]">{selectedWorkItem.expectedArtifact ?? '—'}</div>
                                                </div>
                                                <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                    <div className="font-medium text-[var(--app-fg)]">Done criteria</div>
                                                    <div className="mt-1 text-[var(--app-hint)]">{selectedWorkItem.doneCriteria ?? '—'}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className={softPanelClass}>
                                                <div className="mb-2 text-sm font-semibold text-[var(--app-fg)]">Assignments & leases</div>
                                                <div className="space-y-2">
                                                    {selectedWorkItemAssignments.map((item) => (
                                                        <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                            <div className="font-medium text-[var(--app-fg)]">{item.participantId}</div>
                                                            <div className="text-[var(--app-hint)]">{item.status} · {formatTime(item.createdAt)}</div>
                                                        </div>
                                                    ))}
                                                    {selectedWorkItemLeases.map((item) => (
                                                        <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                            <div className="font-medium text-[var(--app-fg)]">lease {item.participantId}</div>
                                                            <div className="text-[var(--app-hint)]">{item.status} · expires {item.expiresAt ? formatTime(item.expiresAt) : '—'}</div>
                                                        </div>
                                                    ))}
                                                    {selectedWorkItemAssignments.length === 0 && selectedWorkItemLeases.length === 0 ? <div className="text-xs text-[var(--app-hint)]">No assignment state yet.</div> : null}
                                                </div>
                                            </div>
                                            <div className={softPanelClass}>
                                                <div className="mb-2 text-sm font-semibold text-[var(--app-fg)]">Evidence snapshot</div>
                                                <div className="space-y-2">
                                                    {selectedWorkItemOutcomes.slice(0, 2).map((item) => (
                                                        <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                            <div className="font-medium text-[var(--app-fg)]">{item.kind}</div>
                                                            <div className="text-[var(--app-hint)]">{prettyJson(item.content)}</div>
                                                        </div>
                                                    ))}
                                                    {selectedWorkItemArtifacts.slice(0, 2).map((item) => (
                                                        <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                            <div className="font-medium text-[var(--app-fg)]">{item.title}</div>
                                                            <div className="text-[var(--app-hint)]">{item.kind}</div>
                                                        </div>
                                                    ))}
                                                    {selectedWorkItemOutcomes.length === 0 && selectedWorkItemArtifacts.length === 0 ? <div className="text-xs text-[var(--app-hint)]">No outputs linked yet.</div> : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : <div className="text-sm text-[var(--app-hint)]">Select a work item to inspect details.</div>}
                            </section>

                            <section className={pageCardClass}>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold text-[var(--app-fg)]">Next / previous task</div>
                                    <div className="text-xs text-[var(--app-hint)]">Quick queue navigation</div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <button type="button" disabled={!previousWorkItem} onClick={() => previousWorkItem ? setSelectedWorkItemId(previousWorkItem.id) : null} className={`rounded-2xl border p-3 text-left ${previousWorkItem ? 'border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 hover:border-[var(--app-link)]/30' : 'border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/30 opacity-50'}`}>
                                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Previous</div>
                                        <div className="mt-1 text-sm font-medium text-[var(--app-fg)]">{previousWorkItem?.title ?? 'None'}</div>
                                    </button>
                                    <button type="button" disabled={!nextWorkItem} onClick={() => nextWorkItem ? setSelectedWorkItemId(nextWorkItem.id) : null} className={`rounded-2xl border p-3 text-left ${nextWorkItem ? 'border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 hover:border-[var(--app-link)]/30' : 'border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/30 opacity-50'}`}>
                                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Next</div>
                                        <div className="mt-1 text-sm font-medium text-[var(--app-fg)]">{nextWorkItem?.title ?? 'None'}</div>
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                ) : null}

                {activeTab === 'execute' ? (
                    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                        <div className={`grid gap-4 ${workbenchSidebarClass}`}>
                            <section className={pageCardClass}>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div>
                                        <div className={sectionTitleClass}>People doing the work</div>
                                        <div className="text-xs text-[var(--app-hint)]">Choose a participant on the left; act on the right.</div>
                                    </div>
                                    <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-hint)]">{swarm.participants.length} participants</span>
                                </div>
                                <div className="mb-3 grid gap-2 grid-cols-2 text-xs">
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2 text-[var(--app-hint)]">agents {sessionParticipants.length}</div>
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2 text-[var(--app-hint)]">activities {swarm.activities.length}</div>
                                </div>
                                {swarm.participants.length > 0 ? (
                                    <div className="space-y-2 text-sm">
                                        {swarm.participants.map((participant) => (
                                            <div key={participant.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-[var(--app-fg)]">{participant.kind} {participant.refId ? `· ${participant.refId}` : ''}</div>
                                                        <div className="text-xs text-[var(--app-hint)]">{participant.provider ?? 'local'} {participant.model ? `· ${participant.model}` : ''}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (!api) return
                                                            setIsSubmitting(true)
                                                            try {
                                                                await api.removeSwarmParticipant(swarmId, participant.id)
                                                                await refetch()
                                                            } finally {
                                                                setIsSubmitting(false)
                                                            }
                                                        }}
                                                        className={subtleButtonClass}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <div className="text-sm text-[var(--app-hint)]">No participants yet.</div>}
                                <div className="mt-3 flex gap-2">
                                    <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`}>
                                        <option value="">Add session participant…</option>
                                        {availableSessions.map((session) => (
                                            <option key={session.id} value={session.id}>{session.metadata?.name ?? session.id}</option>
                                        ))}
                                    </select>
                                    <button type="button" onClick={() => { void handleAddSessionParticipant() }} disabled={isSubmitting || !selectedSessionId} className={primaryButtonClass}>Add</button>
                                </div>
                            </section>

                            <section className={pageCardClass}>
                                <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Execution pulse</div>
                                <div className="space-y-2">
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2 text-xs text-[var(--app-hint)]">open work {openWorkItems.length}</div>
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2 text-xs text-[var(--app-hint)]">review queue {reviewQueue.length}</div>
                                    <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2 text-xs text-[var(--app-hint)]">blocked {blockedWorkItems.length}</div>
                                </div>
                            </section>
                        </div>

                        <div className="grid gap-4">
                            <section className={pageCardClass}>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-semibold text-[var(--app-fg)]">Execution workbench</div>
                                        <div className="text-xs text-[var(--app-hint)]">Dispatch, update progress, and broadcast from one place.</div>
                                    </div>
                                    {selectedWorkItem ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStateBadgeClass(selectedWorkItem.status)}`}>{selectedWorkItem.status}</span> : null}
                                </div>
                                {!selectedWorkItem ? (
                                    <div className={`${softPanelClass} mb-4 text-sm text-[var(--app-hint)]`}>
                                        Select a work item in Plan first, then come here to assign and coordinate execution.
                                    </div>
                                ) : null}
                                {selectedWorkItem ? (
                                    <div className={`${softPanelClass} mb-4 space-y-2`}>
                                        <div className="text-sm font-medium text-[var(--app-fg)]">{selectedWorkItem.title}</div>
                                        <div className="text-xs text-[var(--app-hint)]">assigned {selectedWorkItem.assignedParticipantId ?? '—'} · expected {selectedWorkItem.expectedArtifact ?? '—'}</div>
                                    </div>
                                ) : null}
                                <div className="grid gap-4 lg:grid-cols-2">
                                    <div className={softPanelClass}>
                                        <div className="mb-2 text-sm font-semibold text-[var(--app-fg)]">Dispatch task</div>
                                        <div className="space-y-2">
                                            <select value={dispatchTargetId} onChange={(event) => setDispatchTargetId(event.target.value)} className={inputClass}>
                                                <option value="">Auto-select best participant…</option>
                                                {sessionParticipants.map((participant) => (
                                                    <option key={participant.id} value={participant.id}>{participant.refId}</option>
                                                ))}
                                            </select>
                                            <select value={dispatchWorkItemId} onChange={(event) => setDispatchWorkItemId(event.target.value)} className={inputClass}>
                                                <option value="">Link work item…</option>
                                                {prioritizedWorkItems.map((workItem) => (
                                                    <option key={workItem.id} value={workItem.id}>{workItem.title}</option>
                                                ))}
                                            </select>
                                            <input value={dispatchText} onChange={(event) => setDispatchText(event.target.value)} placeholder="Tell the assignee what to do next" className={inputClass} />
                                            <button type="button" onClick={() => { void handleDispatch() }} disabled={isSubmitting || !dispatchText.trim()} className={primaryButtonClass}>Dispatch</button>
                                        </div>
                                    </div>
                                    <div className={softPanelClass}>
                                        <div className="mb-2 text-sm font-semibold text-[var(--app-fg)]">Broadcast update</div>
                                        <div className="space-y-2">
                                            <select value={broadcastGroupId} onChange={(event) => setBroadcastGroupId(event.target.value)} className={inputClass}>
                                                <option value="">Choose group…</option>
                                                {groups.map((group) => (
                                                    <option key={group.group.id} value={group.group.id}>{group.group.name}</option>
                                                ))}
                                            </select>
                                            <input value={broadcastText} onChange={(event) => setBroadcastText(event.target.value)} placeholder="Optional swarm update" className={inputClass} />
                                            <button type="button" onClick={() => { void handleBroadcast() }} disabled={isSubmitting || !broadcastGroupId} className={primaryButtonClass}>Broadcast</button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className={pageCardClass}>
                                <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Progress updates</div>
                                <div className={`mb-3 space-y-2 ${softPanelClass}`}>
                                    <div className="flex gap-2">
                                        <input value={activityKind} onChange={(event) => setActivityKind(event.target.value)} className="w-32 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]" placeholder="kind" />
                                        <select value={roleParticipantId} onChange={(event) => setRoleParticipantId(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`}>
                                            <option value="">Participant…</option>
                                            {swarm.participants.map((participant) => (
                                                <option key={participant.id} value={participant.id}>{participant.kind} {participant.refId ?? participant.id}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <input value={activityContent} onChange={(event) => setActivityContent(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`} placeholder="Report progress, blocker, or handoff" />
                                        <button type="button" onClick={() => { void handleAddActivity() }} disabled={isSubmitting || !activityKind.trim()} className={primaryButtonClass}>Add</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {swarm.activities.length > 0 ? swarm.activities.map((item) => (
                                        <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2.5 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-medium text-[var(--app-fg)]">{item.kind}</div>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStateBadgeClass(item.status)}`}>{item.status}</span>
                                            </div>
                                            {item.content ? <div className="mt-1 text-xs text-[var(--app-hint)]">{prettyJson(item.content)}</div> : null}
                                        </div>
                                    )) : <div className="text-sm text-[var(--app-hint)]">No activities yet.</div>}
                                </div>
                            </section>
                        </div>

                        <section className="grid gap-4 lg:grid-cols-2 lg:col-span-2">
                            <SwarmRoleProfilesPanel
                                swarm={swarm}
                                swarmSkills={swarmSkills}
                                roleParticipantId={roleParticipantId}
                                roleName={roleName}
                                roleProfileRole={roleProfileRole}
                                roleProfileInstruction={roleProfileInstruction}
                                roleProfileSkills={roleProfileSkills}
                                roleProfileTools={roleProfileTools}
                                roleProfileOutputContract={roleProfileOutputContract}
                                isSubmitting={isSubmitting}
                                formatTime={formatTime}
                                onRoleParticipantChange={setRoleParticipantId}
                                onRoleNameChange={setRoleName}
                                onBindRole={() => { void handleAddRoleBinding() }}
                                onRoleProfileRoleChange={setRoleProfileRole}
                                onRoleProfileInstructionChange={setRoleProfileInstruction}
                                onRoleProfileSkillsChange={setRoleProfileSkills}
                                onRoleProfileToolsChange={setRoleProfileTools}
                                onRoleProfileOutputContractChange={setRoleProfileOutputContract}
                                onAddRoleProfile={() => { void handleAddRoleProfile() }}
                                getRoleProfileDraft={getRoleProfileDraft}
                                onRoleProfileDraftChange={handleRoleProfileDraftChange}
                                onSaveRoleProfile={(roleProfileId, profile) => { void handleSaveRoleProfile(roleProfileId, profile) }}
                                appendSkillName={appendSkillName}
                            />
                            <SwarmPoliciesPanel
                                swarm={swarm}
                                policyKind={policyKind}
                                isSubmitting={isSubmitting}
                                onPolicyKindChange={setPolicyKind}
                                onAddPolicy={() => { void handleAddPolicy() }}
                                getPolicyDraft={getPolicyDraft}
                                onPolicyDraftChange={handlePolicyDraftChange}
                                onSavePolicyConfig={(policyId, currentConfig) => { void handleSavePolicyConfig(policyId, currentConfig) }}
                                onTogglePolicy={(policyId, currentStatus) => { void handleTogglePolicy(policyId, currentStatus) }}
                            />
                        </section>
                    </div>
                ) : null}

                {activeTab === 'decide' ? (
                    <div className="grid gap-4">
                        <section className={pageCardClass}>
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div>
                                    <div className={sectionTitleClass}>Decision board</div>
                                    <div className="text-xs text-[var(--app-hint)]">Proposals, decisions, blockers, and summaries before raw event history.</div>
                                </div>
                                <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-hint)]">{decisionOutcomes.length} cards</span>
                            </div>
                            {decisionOutcomes.length > 0 ? (
                                <div className="grid gap-3 lg:grid-cols-2">
                                    {decisionOutcomes.map((item) => (
                                        <div key={item.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/65 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-medium text-[var(--app-fg)]">{item.kind}</div>
                                                <div className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStateBadgeClass(item.status)}`}>{item.status}</div>
                                            </div>
                                            {item.workItemId ? <div className="mt-1 text-xs text-[var(--app-hint)]">work item: {item.workItemId}</div> : null}
                                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--app-fg)]">{prettyJson(item.content)}</pre>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">
                                    No proposals, decisions, or blockers yet. Outcomes and review items will appear here after execution starts.
                                </div>
                            )}
                        </section>

                        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                            <div className={`grid gap-4 ${workbenchSidebarClass}`}>
                                <section className={pageCardClass}>
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-semibold text-[var(--app-fg)]">Review queue</div>
                                            <div className="text-xs text-[var(--app-hint)]">Pick the item that needs a decision first.</div>
                                        </div>
                                        <span className="rounded-full bg-[var(--app-secondary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-hint)]">{reviewQueue.length}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {reviewQueue.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setSelectedWorkItemId(item.id)}
                                                className={`block w-full rounded-xl border px-3 py-2.5 text-left text-sm ${selectedWorkItem?.id === item.id ? 'border-[var(--app-link)] bg-[var(--app-subtle-bg)]' : 'border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60'}`}
                                            >
                                                <div className="font-medium text-[var(--app-fg)]">{item.title}</div>
                                                <div className="text-xs text-[var(--app-hint)]">{item.status} · {item.assignedParticipantId ?? 'unassigned'}</div>
                                            </button>
                                        ))}
                                        {reviewQueue.length === 0 ? (
                                            <div className="rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">
                                                No review queue items right now. Dispatch work first, then come back when artifacts or outcomes need review.
                                            </div>
                                        ) : null}
                                    </div>
                                    {selectedWorkItem ? (
                                        <div className={`mt-3 space-y-3 ${softPanelClass}`}>
                                            <div className="text-sm font-medium text-[var(--app-fg)]">Review {selectedWorkItem.title}</div>
                                            <div className="flex gap-2">
                                                <select value={reviewArtifactId} onChange={(event) => setReviewArtifactId(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`}>
                                                    <option value="">Select artifact…</option>
                                                    {selectedWorkItemArtifacts.map((item) => (
                                                        <option key={item.id} value={item.id}>{item.title}</option>
                                                    ))}
                                                </select>
                                                <select value={reviewVerdict} onChange={(event) => setReviewVerdict(event.target.value)} className="w-44 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]">
                                                    <option value="approved">approved</option>
                                                    <option value="changes_requested">changes_requested</option>
                                                    <option value="commented">commented</option>
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <input value={reviewSummary} onChange={(event) => setReviewSummary(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`} placeholder="Review summary" />
                                                <button type="button" onClick={() => { void handleAddReview() }} disabled={isSubmitting} className={primaryButtonClass}>Review</button>
                                            </div>
                                            {selectedWorkItemReviews.length > 0 ? (
                                                <div className="space-y-2">
                                                    {selectedWorkItemReviews.map((item) => (
                                                        <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                            <div className="font-medium text-[var(--app-fg)]">{item.verdict ?? item.status}</div>
                                                            <div className="text-[var(--app-hint)]">{item.summary ?? '—'}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <div className="text-sm text-[var(--app-hint)]">No reviews yet.</div>}
                                        </div>
                                    ) : null}
                                </section>

                                <section className={pageCardClass}>
                                    <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Decision support</div>
                                    <div className="grid gap-2 text-xs">
                                        <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2 text-[var(--app-hint)]">review queue {reviewQueue.length}</div>
                                        <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2 text-[var(--app-hint)]">decision cards {decisionOutcomes.length}</div>
                                        <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/55 px-3 py-2 text-[var(--app-hint)]">threads {swarm.threads.length}</div>
                                    </div>
                                </section>

                                <section className={pageCardClass}>
                                    <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Discussion threads</div>
                                    <div className={`mb-3 flex gap-2 ${softPanelClass}`}>
                                        <input value={threadTitle} onChange={(event) => setThreadTitle(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`} placeholder="Thread title" />
                                        <button type="button" onClick={() => { void handleAddThread() }} disabled={isSubmitting || !threadTitle.trim()} className={primaryButtonClass}>Add</button>
                                    </div>
                                    <div className="space-y-2">
                                        {swarm.threads.length > 0 ? swarm.threads.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setSelectedThreadId(item.id)}
                                                className={`block w-full rounded-xl border px-3 py-2.5 text-left text-sm ${selectedThread?.id === item.id ? 'border-[var(--app-link)] bg-[var(--app-subtle-bg)]' : 'border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60'}`}
                                            >
                                                <div className="font-medium text-[var(--app-fg)]">{item.title}</div>
                                                <div className="text-xs text-[var(--app-hint)]">{item.kind} · {item.status}</div>
                                            </button>
                                        )) : <div className="text-sm text-[var(--app-hint)]">No threads yet.</div>}
                                    </div>
                                    {selectedThread ? (
                                        <div className={`mt-3 space-y-2 ${softPanelClass}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-medium text-[var(--app-fg)]">Thread entries</div>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => { void handleSynthesizeThread(false) }} disabled={isSubmitting} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)] disabled:opacity-60">Synthesize</button>
                                                    <button type="button" onClick={() => { void handleSynthesizeThread(true) }} disabled={isSubmitting} className="rounded-xl bg-[var(--app-link)] px-2.5 py-1 text-xs text-white disabled:opacity-60">Decide</button>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <input value={threadEntryKind} onChange={(event) => setThreadEntryKind(event.target.value)} className="w-32 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]" placeholder="kind" />
                                                <input value={threadEntryContent} onChange={(event) => setThreadEntryContent(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`} placeholder="Thread entry" />
                                                <button type="button" onClick={() => { void handleAddThreadEntry() }} disabled={isSubmitting || !threadEntryKind.trim()} className={primaryButtonClass}>Add</button>
                                            </div>
                                            <div className="space-y-2">
                                                {selectedThreadEntries.map((entry) => (
                                                    <div key={entry.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs">
                                                        <div className="font-medium text-[var(--app-fg)]">{entry.kind}</div>
                                                        <div className="mt-1 whitespace-pre-wrap text-[var(--app-hint)]">{prettyJson(entry.content)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </section>
                            </div>

                            <div className="grid gap-4">
                                <section className={pageCardClass}>
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-semibold text-[var(--app-fg)]">Decision workbench</div>
                                            <div className="text-xs text-[var(--app-hint)]">Context for the currently selected review item.</div>
                                        </div>
                                        {selectedWorkItem ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStateBadgeClass(selectedWorkItem.status)}`}>{selectedWorkItem.status}</span> : null}
                                    </div>
                                    {selectedWorkItem ? (
                                        <div className={`${softPanelClass} mb-3 space-y-2`}>
                                            <div className="text-sm font-medium text-[var(--app-fg)]">{selectedWorkItem.title}</div>
                                            <div className="text-xs text-[var(--app-hint)]">assigned {selectedWorkItem.assignedParticipantId ?? '—'} · expected {selectedWorkItem.expectedArtifact ?? '—'}</div>
                                            <div className="grid gap-2 md:grid-cols-2">
                                                <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs text-[var(--app-hint)]">reviews {selectedWorkItemReviews.length}</div>
                                                <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs text-[var(--app-hint)]">artifacts {selectedWorkItemArtifacts.length}</div>
                                            </div>
                                        </div>
                                    ) : null}
                                </section>

                                <section className={pageCardClass}>
                                    <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Record outcome</div>
                                    <div className={`mb-3 flex flex-col gap-2 ${softPanelClass}`}>
                                        <div className="flex gap-2">
                                            <input value={outcomeKind} onChange={(event) => setOutcomeKind(event.target.value)} className="w-32 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]" placeholder="kind" />
                                            <button type="button" onClick={() => { void handleAddOutcome() }} disabled={isSubmitting || !outcomeContent.trim()} className={primaryButtonClass}>Add outcome</button>
                                        </div>
                                        <select value={outcomeWorkItemId} onChange={(event) => setOutcomeWorkItemId(event.target.value)} className={inputClass}>
                                            <option value="">Link work item…</option>
                                            {swarm.workItems.map((workItem) => (
                                                <option key={workItem.id} value={workItem.id}>{workItem.title}</option>
                                            ))}
                                        </select>
                                        <textarea value={outcomeContent} onChange={(event) => setOutcomeContent(event.target.value)} placeholder="Outcome content" className={`min-h-24 ${inputClass}`} />
                                    </div>
                                    <div className="space-y-3">
                                        {swarm.outcomes.map((outcome) => (
                                            <div key={outcome.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/65 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-medium text-[var(--app-fg)]">{outcome.kind}</div>
                                                    <div className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStateBadgeClass(outcome.status)}`}>{outcome.status}</div>
                                                </div>
                                                {outcome.workItemId ? <div className="mt-1 text-xs text-[var(--app-hint)]">work item: {outcome.workItemId}</div> : null}
                                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--app-fg)]">{prettyJson(outcome.content)}</pre>
                                            </div>
                                        ))}
                                        {swarm.outcomes.length === 0 ? <div className="text-sm text-[var(--app-hint)]">No outcomes yet.</div> : null}
                                    </div>
                                </section>

                                <section className={pageCardClass}>
                                    <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Artifacts</div>
                                    <div className={`mb-3 flex flex-col gap-2 ${softPanelClass}`}>
                                        <div className="flex gap-2">
                                            <input value={artifactKind} onChange={(event) => setArtifactKind(event.target.value)} className="w-32 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]" placeholder="kind" />
                                            <input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`} placeholder="Artifact title" />
                                        </div>
                                        <div className="flex gap-2">
                                            <select value={artifactWorkItemId} onChange={(event) => setArtifactWorkItemId(event.target.value)} className="w-44 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]">
                                                <option value="">Link work item…</option>
                                                {swarm.workItems.map((workItem) => (
                                                    <option key={workItem.id} value={workItem.id}>{workItem.title}</option>
                                                ))}
                                            </select>
                                            <input value={artifactUrl} onChange={(event) => setArtifactUrl(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`} placeholder="Optional URL" />
                                            <button type="button" onClick={() => { void handleAddArtifact() }} disabled={isSubmitting || !artifactTitle.trim()} className={primaryButtonClass}>Add artifact</button>
                                        </div>
                                        <div className="flex gap-2">
                                            <select value={reportArtifactId} onChange={(event) => setReportArtifactId(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`}>
                                                <option value="">Import report…</option>
                                                {reports.map((report) => (
                                                    <option key={report.id} value={report.id}>{report.title} · {report.status}</option>
                                                ))}
                                            </select>
                                            <button type="button" onClick={() => { void handleAddReportArtifact() }} disabled={isSubmitting || !reportArtifactId.trim()} className={subtleButtonClass}>Import report</button>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {swarm.artifacts.map((artifact) => (
                                            <div key={artifact.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/65 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-medium text-[var(--app-fg)]">{artifact.title}</div>
                                                    <div className="text-xs text-[var(--app-hint)]">{artifact.status}</div>
                                                </div>
                                                <div className="mt-1 text-xs text-[var(--app-hint)]">{artifact.kind}</div>
                                                {artifact.workItemId ? <div className="mt-1 text-xs text-[var(--app-hint)]">work item: {artifact.workItemId}</div> : null}
                                                {artifact.url ? <a href={artifact.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[var(--app-link)] underline">Open link</a> : null}
                                            </div>
                                        ))}
                                        {swarm.artifacts.length === 0 ? <div className="text-sm text-[var(--app-hint)]">No artifacts yet.</div> : null}
                                    </div>
                                </section>
                            </div>
                        </section>
                    </div>
                ) : null}

                {activeTab === 'history' ? (
                    <div className="grid gap-4">
                        <section className={pageCardClass}>
                            <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Timeline</div>
                            {timelineEntries.length > 0 ? (
                                <div className="space-y-3 text-sm">
                                    {timelineEntries.map((entry) => (
                                        <div key={entry.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 font-medium text-[var(--app-fg)]">
                                                    <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-hint)]">{entry.kind}</span>
                                                    <span>{entry.title}</span>
                                                </div>
                                                <div className="text-xs text-[var(--app-hint)]">{formatTime(entry.at)}</div>
                                            </div>
                                            {entry.subtitle ? <div className="mt-1 text-xs text-[var(--app-hint)]">{entry.subtitle}</div> : null}
                                            {entry.body ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--app-fg)]">{entry.body}</pre> : null}
                                        </div>
                                    ))}
                                </div>
                            ) : <div className="text-sm text-[var(--app-hint)]">No timeline yet.</div>}
                        </section>

                        {selectedWorkItem ? (
                            <section className="grid gap-4 lg:grid-cols-3">
                                <div className={pageCardClass}>
                                    <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Selected transitions</div>
                                    {selectedWorkItemTransitions.length > 0 ? (
                                        <div className="space-y-2 text-sm">
                                            {selectedWorkItemTransitions.map((item) => (
                                                <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2.5">
                                                    <div className="font-medium text-[var(--app-fg)]">{item.fromState ?? '—'} → {item.toState}</div>
                                                    <div className="text-xs text-[var(--app-hint)]">{formatTime(item.createdAt)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <div className="text-sm text-[var(--app-hint)]">No work-item transitions yet.</div>}
                                </div>
                                <div className={pageCardClass}>
                                    <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Selected events</div>
                                    {selectedWorkItemEvents.length > 0 ? (
                                        <div className="space-y-2 text-sm">
                                            {selectedWorkItemEvents.map((item) => (
                                                <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2.5">
                                                    <div className="font-medium text-[var(--app-fg)]">{item.type}</div>
                                                    <div className="text-xs text-[var(--app-hint)]">{formatTime(item.createdAt)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <div className="text-sm text-[var(--app-hint)]">No work-item events yet.</div>}
                                </div>
                                <div className={pageCardClass}>
                                    <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Selected outputs</div>
                                    <div className="space-y-2">
                                        {selectedWorkItemOutcomes.slice(0, 4).map((item) => (
                                            <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2.5 text-xs">
                                                <div className="font-medium text-[var(--app-fg)]">{item.kind}</div>
                                                <div className="text-[var(--app-hint)]">{prettyJson(item.content)}</div>
                                            </div>
                                        ))}
                                        {selectedWorkItemOutcomes.length === 0 ? <div className="text-sm text-[var(--app-hint)]">No linked outcomes yet.</div> : null}
                                    </div>
                                </div>
                            </section>
                        ) : null}

                        <section className="grid gap-4 lg:grid-cols-3">
                            <div className={pageCardClass}>
                                <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Transitions</div>
                                {swarm.transitions.length > 0 ? (
                                    <div className="space-y-2 text-sm">
                                        {swarm.transitions.map((transition) => (
                                            <div key={transition.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2.5">
                                                <div className="font-medium text-[var(--app-fg)]">{transition.entityType} → {transition.toState}</div>
                                                <div className="text-xs text-[var(--app-hint)]">{transition.fromState ? `${transition.fromState} → ` : ''}{transition.toState} · {formatTime(transition.createdAt)}</div>
                                                {transition.reason ? <div className="mt-1 text-xs text-[var(--app-fg)]">{transition.reason}</div> : null}
                                            </div>
                                        ))}
                                    </div>
                                ) : <div className="text-sm text-[var(--app-hint)]">No transitions yet.</div>}
                            </div>
                            <div className={pageCardClass}>
                                <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Effects</div>
                                {swarm.effects.length > 0 ? (
                                    <div className="space-y-2 text-sm">
                                        {swarm.effects.map((effect) => (
                                            <div key={effect.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2.5">
                                                <div className="font-medium text-[var(--app-fg)]">{effect.kind}</div>
                                                <div className="text-xs text-[var(--app-hint)]">{formatTime(effect.createdAt)}</div>
                                                {effect.workItemId ? <div className="mt-1 text-xs text-[var(--app-hint)]">work item: {effect.workItemId}</div> : null}
                                                {effect.summary ? <div className="mt-1 text-xs text-[var(--app-fg)]">{effect.summary}</div> : null}
                                                {effect.data ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--app-fg)]">{prettyJson(effect.data)}</pre> : null}
                                            </div>
                                        ))}
                                    </div>
                                ) : <div className="text-sm text-[var(--app-hint)]">No effects yet.</div>}
                            </div>
                            <div className={pageCardClass}>
                                <div className="mb-3 text-sm font-semibold text-[var(--app-fg)]">Events</div>
                                {swarm.events.length > 0 ? (
                                    <div className="space-y-2 text-sm">
                                        {swarm.events.map((event) => (
                                            <div key={event.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-2.5">
                                                <div className="font-medium text-[var(--app-fg)]">{event.type}</div>
                                                <div className="text-xs text-[var(--app-hint)]">{formatTime(event.createdAt)}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <div className="text-sm text-[var(--app-hint)]">No events yet.</div>}
                            </div>
                        </section>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
