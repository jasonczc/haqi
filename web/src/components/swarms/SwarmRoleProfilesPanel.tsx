import type { SkillSummary, SwarmDetail } from '@/types/api'

type RoleProfileDraft = {
    instructionText: string
    preferredSkillIds: string
    allowedTools: string
    outputContract: string
}

type SwarmRoleProfilesPanelProps = {
    swarm: SwarmDetail
    swarmSkills: SkillSummary[]
    roleParticipantId: string
    roleName: string
    roleProfileRole: string
    roleProfileInstruction: string
    roleProfileSkills: string
    roleProfileTools: string
    roleProfileOutputContract: string
    isSubmitting: boolean
    formatTime: (value: number) => string
    onRoleParticipantChange: (value: string) => void
    onRoleNameChange: (value: string) => void
    onBindRole: () => void
    onRoleProfileRoleChange: (value: string) => void
    onRoleProfileInstructionChange: (value: string) => void
    onRoleProfileSkillsChange: (value: string) => void
    onRoleProfileToolsChange: (value: string) => void
    onRoleProfileOutputContractChange: (value: string) => void
    onAddRoleProfile: () => void
    getRoleProfileDraft: (profile: SwarmDetail['roleProfiles'][number]) => RoleProfileDraft
    onRoleProfileDraftChange: (
        roleProfileId: string,
        field: 'instructionText' | 'preferredSkillIds' | 'allowedTools' | 'outputContract',
        value: string,
        profile: SwarmDetail['roleProfiles'][number]
    ) => void
    onSaveRoleProfile: (roleProfileId: string, profile: SwarmDetail['roleProfiles'][number]) => void
    appendSkillName: (current: string, skillName: string) => string
}

export function SwarmRoleProfilesPanel(props: SwarmRoleProfilesPanelProps) {
    return (
        <div className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-bg)] p-4 shadow-sm">
            <div className="mb-1 text-sm font-semibold text-[var(--app-fg)]">Roles & Profiles</div>
            <div className="mb-3 text-xs text-[var(--app-hint)]">Bind participants to responsibilities, then define reusable behavior contracts for each role.</div>
            <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/70 p-3 lg:flex-row">
                <select
                    value={props.roleParticipantId}
                    onChange={(event) => props.onRoleParticipantChange(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                >
                    <option value="">Participant…</option>
                    {props.swarm.participants.map((participant) => (
                        <option key={participant.id} value={participant.id}>
                            {participant.kind} {participant.refId ?? participant.id}
                        </option>
                    ))}
                </select>
                <input
                    value={props.roleName}
                    onChange={(event) => props.onRoleNameChange(event.target.value)}
                    className="w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)] lg:w-36"
                    placeholder="role"
                />
                <button
                    type="button"
                    onClick={props.onBindRole}
                    disabled={props.isSubmitting || !props.roleParticipantId || !props.roleName.trim()}
                    className="rounded-xl bg-[var(--app-link)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                    Bind
                </button>
            </div>
            <div className="space-y-3">
                {props.swarm.roleBindings.length > 0 ? props.swarm.roleBindings.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-[var(--app-fg)]">{item.role}</div>
                            <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-hint)]">{item.status}</span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">{item.participantId} · {item.phase ?? 'all phases'}</div>
                    </div>
                )) : <div className="rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">No role bindings yet.</div>}
            </div>
            <div className="mt-3 border-t border-[var(--app-divider)] pt-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--app-hint)]">Role Binding History</div>
                <div className="space-y-2">
                    {props.swarm.roleBindingHistory.length > 0 ? props.swarm.roleBindingHistory.slice(0, 12).map((item) => (
                        <div key={item.id} className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/50 px-3 py-2 text-xs">
                            <div className="font-medium text-[var(--app-fg)]">{item.action} · {item.role}</div>
                            <div className="text-[var(--app-hint)]">{item.participantId} · {item.phase ?? 'all phases'} · {props.formatTime(item.createdAt)}</div>
                            {item.reason ? <div className="text-[var(--app-hint)]">{item.reason}</div> : null}
                        </div>
                    )) : <div className="rounded-xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">No role history yet.</div>}
                </div>
            </div>
            <div className="mt-3 border-t border-[var(--app-divider)] pt-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--app-hint)]">Role Profiles</div>
                <div className="mb-3 space-y-2 rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/70 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            value={props.roleProfileRole}
                            onChange={(event) => props.onRoleProfileRoleChange(event.target.value)}
                            className="w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)] sm:w-36"
                            placeholder="role"
                        />
                        <input
                            value={props.roleProfileOutputContract}
                            onChange={(event) => props.onRoleProfileOutputContractChange(event.target.value)}
                            className="min-w-0 flex-1 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                            placeholder="output contract"
                        />
                    </div>
                    <textarea
                        value={props.roleProfileInstruction}
                        onChange={(event) => props.onRoleProfileInstructionChange(event.target.value)}
                        className="min-h-[120px] w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                        placeholder="role instructions"
                    />
                    <div className="flex flex-col gap-2 lg:flex-row">
                        <input
                            value={props.roleProfileSkills}
                            onChange={(event) => props.onRoleProfileSkillsChange(event.target.value)}
                            className="min-w-0 flex-1 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                            placeholder="preferred skills, comma separated"
                        />
                        <input
                            value={props.roleProfileTools}
                            onChange={(event) => props.onRoleProfileToolsChange(event.target.value)}
                            className="min-w-0 flex-1 rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                            placeholder="allowed tools, comma separated"
                        />
                        <button
                            type="button"
                            onClick={props.onAddRoleProfile}
                            disabled={props.isSubmitting || !props.roleProfileRole.trim()}
                            className="rounded-xl bg-[var(--app-link)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                        >
                            Add
                        </button>
                    </div>
                    {props.swarmSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {props.swarmSkills.slice(0, 12).map((skill) => (
                                <button
                                    key={skill.name}
                                    type="button"
                                    onClick={() => props.onRoleProfileSkillsChange(props.appendSkillName(props.roleProfileSkills, skill.name))}
                                    className="rounded-full border border-[var(--app-divider)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)]"
                                >
                                    ${skill.name}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className="space-y-3">
                    {props.swarm.roleProfiles.length > 0 ? props.swarm.roleProfiles.map((profile) => {
                        const draft = props.getRoleProfileDraft(profile)
                        return (
                            <div key={profile.id} className="rounded-2xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/60 px-3 py-3 text-sm">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <div className="font-medium text-[var(--app-fg)]">{profile.role}</div>
                                    {profile.outputContract ? (
                                        <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">{profile.outputContract}</span>
                                    ) : null}
                                </div>
                                <textarea
                                    value={draft.instructionText}
                                    onChange={(event) => props.onRoleProfileDraftChange(profile.id, 'instructionText', event.target.value, profile)}
                                    className="min-h-[120px] w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                                />
                                <div className="mt-2 grid gap-2 md:grid-cols-3">
                                    <input
                                        value={draft.preferredSkillIds}
                                        onChange={(event) => props.onRoleProfileDraftChange(profile.id, 'preferredSkillIds', event.target.value, profile)}
                                        className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                                        placeholder="skills"
                                    />
                                    <input
                                        value={draft.allowedTools}
                                        onChange={(event) => props.onRoleProfileDraftChange(profile.id, 'allowedTools', event.target.value, profile)}
                                        className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                                        placeholder="tools"
                                    />
                                    <input
                                        value={draft.outputContract}
                                        onChange={(event) => props.onRoleProfileDraftChange(profile.id, 'outputContract', event.target.value, profile)}
                                        className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-link)]"
                                        placeholder="output contract"
                                    />
                                </div>
                                {props.swarmSkills.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {props.swarmSkills.slice(0, 12).map((skill) => (
                                            <button
                                                key={`${profile.id}:${skill.name}`}
                                                type="button"
                                                onClick={() => props.onRoleProfileDraftChange(profile.id, 'preferredSkillIds', props.appendSkillName(draft.preferredSkillIds, skill.name), profile)}
                                                className="rounded-full border border-[var(--app-divider)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)]"
                                            >
                                                ${skill.name}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="mt-2 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => props.onSaveRoleProfile(profile.id, profile)}
                                        disabled={props.isSubmitting}
                                        className="rounded-xl bg-[var(--app-link)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                                    >
                                        Save Role Profile
                                    </button>
                                </div>
                            </div>
                        )
                    }) : <div className="rounded-2xl border border-dashed border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/40 p-4 text-sm text-[var(--app-hint)]">No role profiles yet.</div>}
                </div>
            </div>
        </div>
    )
}
