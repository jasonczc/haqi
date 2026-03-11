import type {
    AttachmentMetadata,
    AuthResponse,
    QueueResponse,
    SessionUsageResponse,
    QueueStatusResponse,
    DeleteUploadResponse,
    ListDirectoryResponse,
    FileReadResponse,
    FileSearchResponse,
    GitCommandResponse,
    MachineMapping,
    MachinePathsExistsResponse,
    MachineMappingsResponse,
    MachinesResponse,
    ImportMachineMappingsResponse,
    ConversationTurnMessagesResponse,
    ConversationTurnsResponse,
    MessagesResponse,
    GroupMessagesResponse,
    GroupConversationTurnMessagesResponse,
    GroupConversationTurnsResponse,
    GroupTasksResponse,
    GroupNoteResponse,
    UpdateGroupNoteResponse,
    RefreshGroupNoteResponse,
    GroupTaskActionResponse,
    GroupsResponse,
    GroupResponse,
    SwarmsResponse,
    SwarmResponse,
    SwarmSubjectResponse,
    SwarmParticipantsResponse,
    SwarmParticipantResponse,
    SwarmOutcomesResponse,
    SwarmOutcomeResponse,
    SwarmWorkItemResponse,
    SwarmWorkItemsResponse,
    SwarmArtifactsResponse,
    SwarmArtifactResponse,
    SwarmTransitionsResponse,
    SwarmTransitionResponse,
    SwarmEventsResponse,
    RefreshMachineMappingsResponse,
    MemoryResponse,
    ProviderSettingsResponse,
    ReportDomainResponse,
    ReportsResponse,
    ProjectOfflineSettingsResponse,
    UpdateMemoryResponse,
    CreateGroupResponse,
    AddGroupMemberResponse,
    RemoveGroupMemberResponse,
    UpdateGroupResponse,
    UpdateProviderResponse,
    PostGroupMessageResponse,
    ModelMode,
    PermissionMode,
    PreviewUrlHistoryResponse,
    PushSubscriptionPayload,
    PushUnsubscribePayload,
    PushVapidPublicKeyResponse,
    SlashCommandsResponse,
    McpServersResponse,
    SkillsResponse,
    SwarmSkillsResponse,
    SpawnResponse,
    UsageOverviewResponse,
    UploadFileResponse,
    VisibilityPayload,
    SessionPreviewUrlResponse,
    SessionResponse,
    SessionsResponse
} from '@/types/api'

type ApiClientOptions = {
    baseUrl?: string
    getToken?: () => string | null
    onUnauthorized?: () => Promise<string | null>
}

type ErrorPayload = {
    error?: unknown
}

function parseErrorCode(bodyText: string): string | undefined {
    try {
        const parsed = JSON.parse(bodyText) as ErrorPayload
        return typeof parsed.error === 'string' ? parsed.error : undefined
    } catch {
        return undefined
    }
}

export class ApiError extends Error {
    status: number
    code?: string
    body?: string

    constructor(message: string, status: number, code?: string, body?: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.body = body
    }
}

export class ApiClient {
    private token: string
    private readonly baseUrl: string | null
    private readonly getToken: (() => string | null) | null
    private readonly onUnauthorized: (() => Promise<string | null>) | null

    constructor(token: string, options?: ApiClientOptions) {
        this.token = token
        this.baseUrl = options?.baseUrl ?? null
        this.getToken = options?.getToken ?? null
        this.onUnauthorized = options?.onUnauthorized ?? null
    }

    private buildUrl(path: string): string {
        if (!this.baseUrl) {
            return path
        }
        try {
            return new URL(path, this.baseUrl).toString()
        } catch {
            return path
        }
    }

    private async request<T>(
        path: string,
        init?: RequestInit,
        attempt: number = 0,
        overrideToken?: string | null
    ): Promise<T> {
        const headers = new Headers(init?.headers)
        const liveToken = this.getToken ? this.getToken() : null
        const authToken = overrideToken !== undefined
            ? (overrideToken ?? (liveToken ?? this.token))
            : (liveToken ?? this.token)
        if (authToken) {
            headers.set('authorization', `Bearer ${authToken}`)
        }
        if (init?.body !== undefined && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const res = await fetch(this.buildUrl(path), {
            ...init,
            headers
        })

        if (res.status === 401) {
            if (attempt === 0 && this.onUnauthorized) {
                const refreshed = await this.onUnauthorized()
                if (refreshed) {
                    this.token = refreshed
                    return await this.request<T>(path, init, attempt + 1, refreshed)
                }
            }
            throw new Error('Session expired. Please sign in again.')
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`)
        }

        return await res.json() as T
    }

    async authenticate(auth: { initData: string } | { accessToken: string }): Promise<AuthResponse> {
        const res = await fetch(this.buildUrl('/api/auth'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(auth)
        })

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const code = parseErrorCode(body)
            const detail = body ? `: ${body}` : ''
            throw new ApiError(`Auth failed: HTTP ${res.status} ${res.statusText}${detail}`, res.status, code, body || undefined)
        }

        return await res.json() as AuthResponse
    }

    async bind(auth: { initData: string; accessToken: string }): Promise<AuthResponse> {
        const res = await fetch(this.buildUrl('/api/bind'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(auth)
        })

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const code = parseErrorCode(body)
            const detail = body ? `: ${body}` : ''
            throw new ApiError(`Bind failed: HTTP ${res.status} ${res.statusText}${detail}`, res.status, code, body || undefined)
        }

        return await res.json() as AuthResponse
    }

    async getSessions(): Promise<SessionsResponse> {
        return await this.request<SessionsResponse>('/api/sessions')
    }

    async getGroups(): Promise<GroupsResponse> {
        return await this.request<GroupsResponse>('/api/groups')
    }

    async getSwarms(): Promise<SwarmsResponse> {
        return await this.request<SwarmsResponse>('/api/swarms')
    }

    async getSwarm(swarmId: string): Promise<SwarmResponse> {
        return await this.request<SwarmResponse>(`/api/swarms/${encodeURIComponent(swarmId)}`)
    }

    async createSwarm(payload: {
        title: string
        createdBy?: string
        status?: string
        currentPhase?: string
        subject?: {
            kind?: string
            summary: string
            successCriteria?: string | null
            constraints?: unknown
            status?: string
        }
    }): Promise<SwarmResponse> {
        return await this.request<SwarmResponse>('/api/swarms', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async updateSwarm(swarmId: string, payload: {
        title?: string
        status?: string
        currentPhase?: string
    }): Promise<SwarmResponse> {
        return await this.request<SwarmResponse>(`/api/swarms/${encodeURIComponent(swarmId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async getSwarmSubject(swarmId: string): Promise<SwarmSubjectResponse> {
        return await this.request<SwarmSubjectResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/subject`)
    }

    async updateSwarmSubject(swarmId: string, payload: {
        kind?: string
        summary?: string
        successCriteria?: string | null
        constraints?: unknown
        status?: string
    }): Promise<SwarmSubjectResponse> {
        return await this.request<SwarmSubjectResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/subject`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async getSwarmParticipants(swarmId: string): Promise<SwarmParticipantsResponse> {
        return await this.request<SwarmParticipantsResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/participants`)
    }

    async addSwarmParticipant(swarmId: string, payload: {
        kind: 'human' | 'agent' | 'service'
        refId?: string
        provider?: string
        model?: string
        capabilities?: string[]
        availability?: string
    }): Promise<SwarmParticipantResponse> {
        return await this.request<SwarmParticipantResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/participants`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async removeSwarmParticipant(swarmId: string, participantId: string): Promise<void> {
        await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/participants/${encodeURIComponent(participantId)}`, {
            method: 'DELETE'
        })
    }

    async getSwarmOutcomes(swarmId: string): Promise<SwarmOutcomesResponse> {
        return await this.request<SwarmOutcomesResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/outcomes`)
    }

    async addSwarmOutcome(swarmId: string, payload: {
        subjectId?: string
        workItemId?: string
        kind: string
        status?: string
        createdByParticipantId?: string
        content?: unknown
        artifactRefs?: string[]
    }): Promise<SwarmOutcomeResponse> {
        return await this.request<SwarmOutcomeResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/outcomes`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async updateSwarmOutcome(swarmId: string, outcomeId: string, payload: {
        workItemId?: string | null
        status?: string
        content?: unknown
        artifactRefs?: string[]
    }): Promise<SwarmOutcomeResponse> {
        return await this.request<SwarmOutcomeResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/outcomes/${encodeURIComponent(outcomeId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async getSwarmWorkItems(swarmId: string): Promise<SwarmWorkItemsResponse> {
        return await this.request<SwarmWorkItemsResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/work-items`)
    }

    async addSwarmWorkItem(swarmId: string, payload: {
        subjectId?: string
        title: string
        intent?: string
        status?: string
        assignedParticipantId?: string
        expectedArtifact?: string
        doneCriteria?: string
    }): Promise<SwarmWorkItemResponse> {
        return await this.request<SwarmWorkItemResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/work-items`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async addSwarmActivity(swarmId: string, payload: {
        subjectId?: string
        workItemId?: string
        kind: string
        status?: string
        participantId?: string
        content?: unknown
    }): Promise<{ activity: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/activities`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async addSwarmRoleBinding(swarmId: string, payload: {
        participantId: string
        role: string
        phase?: string
        status?: string
    }): Promise<{ roleBinding: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/role-bindings`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async addSwarmThread(swarmId: string, payload: {
        title: string
        kind?: string
        status?: string
        summary?: string
    }): Promise<{ thread: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/threads`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async addSwarmThreadEntry(swarmId: string, payload: {
        threadId: string
        kind: string
        participantId?: string
        replyToEntryId?: string
        citesEntryIds?: string[]
        content?: unknown
    }): Promise<{ threadEntry: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/thread-entries`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async addSwarmPolicy(swarmId: string, payload: {
        kind: string
        status?: string
        config?: unknown
    }): Promise<{ policy: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/policies`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async updateSwarmPolicy(swarmId: string, policyId: string, payload: {
        status?: string
        config?: unknown
    }): Promise<{ policy: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/policies/${encodeURIComponent(policyId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async runSwarmPolicies(swarmId: string, payload?: {
        force?: boolean
    }): Promise<{ ok: true; forced: boolean }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/policies/run`, {
            method: 'POST',
            body: JSON.stringify(payload ?? {})
        })
    }

    async addSwarmRoleProfile(swarmId: string, payload: {
        role: string
        instructionText?: string | null
        preferredSkillIds?: string[] | null
        allowedTools?: string[] | null
        outputContract?: string | null
    }): Promise<{ roleProfile: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/role-profiles`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async updateSwarmRoleProfile(swarmId: string, roleProfileId: string, payload: {
        instructionText?: string | null
        preferredSkillIds?: string[] | null
        allowedTools?: string[] | null
        outputContract?: string | null
    }): Promise<{ roleProfile: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/role-profiles/${encodeURIComponent(roleProfileId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async addSwarmReview(swarmId: string, payload: {
        workItemId?: string
        artifactId?: string
        status?: string
        verdict?: string | null
        summary?: string | null
        createdByParticipantId?: string
    }): Promise<{ review: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/reviews`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async updateSwarmReview(swarmId: string, reviewId: string, payload: {
        status?: string
        verdict?: string | null
        summary?: string | null
    }): Promise<{ review: unknown }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/reviews/${encodeURIComponent(reviewId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async updateSwarmWorkItem(swarmId: string, workItemId: string, payload: {
        title?: string
        intent?: string | null
        status?: string
        assignedParticipantId?: string | null
        expectedArtifact?: string | null
        doneCriteria?: string | null
        lastDispatchAt?: number | null
    }): Promise<SwarmWorkItemResponse> {
        return await this.request<SwarmWorkItemResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/work-items/${encodeURIComponent(workItemId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async getSwarmArtifacts(swarmId: string): Promise<SwarmArtifactsResponse> {
        return await this.request<SwarmArtifactsResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/artifacts`)
    }

    async addSwarmArtifact(swarmId: string, payload: {
        workItemId?: string
        kind: string
        title: string
        content?: unknown
        url?: string
        status?: string
    }): Promise<SwarmArtifactResponse> {
        return await this.request<SwarmArtifactResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/artifacts`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async addSwarmArtifactFromReport(swarmId: string, payload: {
        reportId: string
        workItemId?: string
        title?: string
    }): Promise<SwarmArtifactResponse> {
        return await this.request<SwarmArtifactResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/artifacts/from-report`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async getSwarmTransitions(swarmId: string): Promise<SwarmTransitionsResponse> {
        return await this.request<SwarmTransitionsResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/transitions`)
    }

    async addSwarmTransition(swarmId: string, payload: {
        entityType: string
        entityId: string
        fromState?: string | null
        toState: string
        reason?: string | null
        byParticipantId?: string
    }): Promise<SwarmTransitionResponse> {
        return await this.request<SwarmTransitionResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/transitions`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async getSwarmEvents(swarmId: string): Promise<SwarmEventsResponse> {
        return await this.request<SwarmEventsResponse>(`/api/swarms/${encodeURIComponent(swarmId)}/events`)
    }

    async dispatchSwarmWork(swarmId: string, payload: {
        participantId?: string
        sessionId?: string
        workItemId?: string
        title?: string
        expectedArtifact?: string
        doneCriteria?: string
        text: string
    }): Promise<{
        ok: true
        workItem: unknown
        outcome: unknown
        event: unknown
        transition: unknown
    }> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/dispatch`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async broadcastSwarm(swarmId: string, payload: {
        groupId: string
        text?: string
    }): Promise<unknown> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/broadcast`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async autoPlanSwarm(swarmId: string, payload?: {
        dispatch?: boolean
        maxItems?: number
    }): Promise<unknown> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/plan`, {
            method: 'POST',
            body: JSON.stringify(payload ?? {})
        })
    }

    async synthesizeSwarmThread(swarmId: string, threadId: string, payload?: {
        asDecision?: boolean
    }): Promise<unknown> {
        return await this.request(`/api/swarms/${encodeURIComponent(swarmId)}/threads/${encodeURIComponent(threadId)}/synthesize`, {
            method: 'POST',
            body: JSON.stringify(payload ?? {})
        })
    }

    async getGroup(groupId: string): Promise<GroupResponse> {
        return await this.request<GroupResponse>(`/api/groups/${encodeURIComponent(groupId)}`)
    }

    async createGroup(payload: {
        name: string
        description?: string
        noteSessionId?: string
        sessionMemberIds?: string[]
    }): Promise<CreateGroupResponse> {
        return await this.request<CreateGroupResponse>('/api/groups', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async addGroupMember(groupId: string, payload: { sessionId: string }): Promise<AddGroupMemberResponse> {
        return await this.request<AddGroupMemberResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/members`,
            {
                method: 'POST',
                body: JSON.stringify(payload)
            }
        )
    }

    async removeGroupMember(groupId: string, sessionId: string): Promise<RemoveGroupMemberResponse> {
        return await this.request<RemoveGroupMemberResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(sessionId)}`,
            { method: 'DELETE' }
        )
    }

    async updateGroup(groupId: string, payload: {
        name?: string
        description?: string | null
        noteSessionId?: string | null
        notePrompt?: string | null
    }): Promise<UpdateGroupResponse> {
        return await this.request<UpdateGroupResponse>(
            `/api/groups/${encodeURIComponent(groupId)}`,
            {
                method: 'PATCH',
                body: JSON.stringify(payload)
            }
        )
    }

    async deleteGroup(groupId: string): Promise<void> {
        await this.request(`/api/groups/${encodeURIComponent(groupId)}`, {
            method: 'DELETE'
        })
    }

    async getGroupMessages(groupId: string, options?: { beforeSeq?: number | null; limit?: number }): Promise<GroupMessagesResponse> {
        const params = new URLSearchParams()
        if (options?.beforeSeq !== undefined && options.beforeSeq !== null) {
            params.set('beforeSeq', `${options.beforeSeq}`)
        }
        if (options?.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }
        const qs = params.toString()
        return await this.request<GroupMessagesResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/messages${qs ? `?${qs}` : ''}`
        )
    }

    async getGroupConversationTurns(
        groupId: string,
        options?: { beforeTurnIndex?: number | null; limit?: number }
    ): Promise<GroupConversationTurnsResponse> {
        const params = new URLSearchParams()
        if (options?.beforeTurnIndex !== undefined && options.beforeTurnIndex !== null) {
            params.set('beforeTurnIndex', `${options.beforeTurnIndex}`)
        }
        if (options?.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }
        const qs = params.toString()
        return await this.request<GroupConversationTurnsResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/turns${qs ? `?${qs}` : ''}`
        )
    }

    async getGroupConversationTurnMessages(
        groupId: string,
        turnId: string,
        options?: { beforeSeq?: number | null; limit?: number }
    ): Promise<GroupConversationTurnMessagesResponse> {
        const params = new URLSearchParams()
        if (options?.beforeSeq !== undefined && options.beforeSeq !== null) {
            params.set('beforeSeq', `${options.beforeSeq}`)
        }
        if (options?.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }
        const qs = params.toString()
        return await this.request<GroupConversationTurnMessagesResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/turns/${encodeURIComponent(turnId)}/messages${qs ? `?${qs}` : ''}`
        )
    }

    async postGroupMessage(groupId: string, payload: {
        type: 'chat' | 'command' | 'task_state' | 'note_state' | 'system'
        payload?: unknown
        text?: string
        attachments?: AttachmentMetadata[]
        traceId?: string
        taskId?: string
        source?: string
        actorSessionId?: string
        actorName?: string
        targetSessionIds?: string[]
        quotedMessageId?: string
    }): Promise<PostGroupMessageResponse> {
        return await this.request<PostGroupMessageResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/messages`,
            {
                method: 'POST',
                body: JSON.stringify(payload)
            }
        )
    }

    async getGroupTasks(groupId: string, options?: { limit?: number }): Promise<GroupTasksResponse> {
        const params = new URLSearchParams()
        if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
            params.set('limit', `${Math.max(1, Math.floor(options.limit))}`)
        }
        const qs = params.toString()
        return await this.request<GroupTasksResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/tasks${qs ? `?${qs}` : ''}`
        )
    }

    async getGroupNote(groupId: string): Promise<GroupNoteResponse> {
        return await this.request<GroupNoteResponse>(`/api/groups/${encodeURIComponent(groupId)}/note`)
    }

    async updateGroupNote(groupId: string, payload: { content: string; updatedBy?: string }): Promise<UpdateGroupNoteResponse> {
        return await this.request<UpdateGroupNoteResponse>(`/api/groups/${encodeURIComponent(groupId)}/note`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async refreshGroupNote(groupId: string, payload?: { source?: string; command?: string }): Promise<RefreshGroupNoteResponse> {
        return await this.request<RefreshGroupNoteResponse>(`/api/groups/${encodeURIComponent(groupId)}/note/refresh`, {
            method: 'POST',
            body: JSON.stringify(payload ?? {})
        })
    }

    async broadcastGroupNote(groupId: string): Promise<{ success: boolean }> {
        return await this.request<{ success: boolean }>(`/api/groups/${encodeURIComponent(groupId)}/broadcast-note`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async claimGroupTask(groupId: string, taskId: string): Promise<GroupTaskActionResponse> {
        return await this.request<GroupTaskActionResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(taskId)}/claim`,
            { method: 'POST', body: JSON.stringify({}) }
        )
    }

    async doneGroupTask(groupId: string, taskId: string): Promise<GroupTaskActionResponse> {
        return await this.request<GroupTaskActionResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(taskId)}/done`,
            { method: 'POST', body: JSON.stringify({}) }
        )
    }

    async cancelGroupTask(groupId: string, taskId: string): Promise<GroupTaskActionResponse> {
        return await this.request<GroupTaskActionResponse>(
            `/api/groups/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(taskId)}/cancel`,
            { method: 'POST', body: JSON.stringify({}) }
        )
    }

    async getMemory(): Promise<MemoryResponse> {
        return await this.request<MemoryResponse>('/api/memory')
    }

    async updateMemory(payload: {
        content?: string
        enabled?: boolean
        pureContextMode?: boolean
        updatedBy?: string
    }): Promise<UpdateMemoryResponse> {
        return await this.request<UpdateMemoryResponse>('/api/memory', {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async getReportDomainSettings(): Promise<ReportDomainResponse> {
        return await this.request<ReportDomainResponse>('/api/reports/domain')
    }

    async getReports(): Promise<ReportsResponse> {
        return await this.request<ReportsResponse>('/api/reports')
    }

    async updateReportDomainSettings(payload: { domain: string | null }): Promise<ReportDomainResponse> {
        return await this.request<ReportDomainResponse>('/api/reports/domain', {
            method: 'PATCH',
            body: JSON.stringify(payload)
        })
    }

    async getProjectOfflineSettings(): Promise<ProjectOfflineSettingsResponse> {
        return await this.request<ProjectOfflineSettingsResponse>('/api/settings/project-offline')
    }

    async updateProjectOfflineSettings(payload: { directories: string[] }): Promise<ProjectOfflineSettingsResponse> {
        return await this.request<ProjectOfflineSettingsResponse>('/api/settings/project-offline', {
            method: 'PUT',
            body: JSON.stringify(payload)
        })
    }

    async getPushVapidPublicKey(): Promise<PushVapidPublicKeyResponse> {
        return await this.request<PushVapidPublicKeyResponse>('/api/push/vapid-public-key')
    }

    async subscribePushNotifications(payload: PushSubscriptionPayload): Promise<void> {
        await this.request('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async unsubscribePushNotifications(payload: PushUnsubscribePayload): Promise<void> {
        await this.request('/api/push/subscribe', {
            method: 'DELETE',
            body: JSON.stringify(payload)
        })
    }

    async setVisibility(payload: VisibilityPayload): Promise<void> {
        await this.request('/api/visibility', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async getSession(sessionId: string): Promise<SessionResponse> {
        return await this.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
    }

    async getPreviewUrlHistory(limit?: number): Promise<PreviewUrlHistoryResponse> {
        const qs = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : ''
        return await this.request<PreviewUrlHistoryResponse>(`/api/sessions/preview-url-history${qs}`)
    }

    async setSessionPreviewUrl(sessionId: string, url: string | null): Promise<SessionPreviewUrlResponse> {
        return await this.request<SessionPreviewUrlResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/preview-url`, {
            method: 'PATCH',
            body: JSON.stringify({ url })
        })
    }

    async getMessages(sessionId: string, options: { beforeSeq?: number | null; limit?: number }): Promise<MessagesResponse> {
        const params = new URLSearchParams()
        if (options.beforeSeq !== undefined && options.beforeSeq !== null) {
            params.set('beforeSeq', `${options.beforeSeq}`)
        }
        if (options.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }

        const qs = params.toString()
        const url = `/api/sessions/${encodeURIComponent(sessionId)}/messages${qs ? `?${qs}` : ''}`
        return await this.request<MessagesResponse>(url)
    }

    async getConversationTurns(
        sessionId: string,
        options?: { beforeTurnIndex?: number | null; limit?: number }
    ): Promise<ConversationTurnsResponse> {
        const params = new URLSearchParams()
        if (options?.beforeTurnIndex !== undefined && options.beforeTurnIndex !== null) {
            params.set('beforeTurnIndex', `${options.beforeTurnIndex}`)
        }
        if (options?.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }

        const qs = params.toString()
        const url = `/api/sessions/${encodeURIComponent(sessionId)}/turns${qs ? `?${qs}` : ''}`
        return await this.request<ConversationTurnsResponse>(url)
    }

    async getConversationTurnMessages(
        sessionId: string,
        turnId: string,
        options?: { beforeSeq?: number | null; limit?: number }
    ): Promise<ConversationTurnMessagesResponse> {
        const params = new URLSearchParams()
        if (options?.beforeSeq !== undefined && options.beforeSeq !== null) {
            params.set('beforeSeq', `${options.beforeSeq}`)
        }
        if (options?.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }

        const qs = params.toString()
        const url = `/api/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/messages${qs ? `?${qs}` : ''}`
        return await this.request<ConversationTurnMessagesResponse>(url)
    }

    async getGitStatus(sessionId: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-status`)
    }

    async getGitDiffNumstat(sessionId: string, staged: boolean): Promise<GitCommandResponse> {
        const params = new URLSearchParams()
        params.set('staged', staged ? 'true' : 'false')
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-diff-numstat?${params.toString()}`)
    }

    async getGitDiffFile(sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse> {
        const params = new URLSearchParams()
        params.set('path', path)
        if (staged !== undefined) {
            params.set('staged', staged ? 'true' : 'false')
        }
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-diff-file?${params.toString()}`)
    }

    async getQueueStatus(sessionId: string): Promise<QueueStatusResponse> {
        return await this.request<QueueStatusResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/queue-status`)
    }

    async getCodexStatus(sessionId: string): Promise<QueueStatusResponse> {
        return await this.getQueueStatus(sessionId)
    }

    async getQueue(sessionId: string): Promise<QueueResponse> {
        return await this.request<QueueResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/queue`)
    }

    async getCodexQueue(sessionId: string): Promise<QueueResponse> {
        return await this.getQueue(sessionId)
    }

    async enqueueQueueMessage(
        sessionId: string,
        payload: {
            text: string
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
        }
    ): Promise<QueueResponse> {
        return await this.request<QueueResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/queue/enqueue`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async enqueueCodexMessage(
        sessionId: string,
        payload: {
            text: string
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
        }
    ): Promise<QueueResponse> {
        return await this.enqueueQueueMessage(sessionId, payload)
    }

    async removeQueueItem(sessionId: string, id: string): Promise<QueueResponse> {
        return await this.request<QueueResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/queue/remove`, {
            method: 'POST',
            body: JSON.stringify({ id })
        })
    }

    async removeCodexQueueItem(sessionId: string, id: string): Promise<QueueResponse> {
        return await this.removeQueueItem(sessionId, id)
    }

    async moveQueueItem(sessionId: string, id: string, toIndex: number): Promise<QueueResponse> {
        return await this.request<QueueResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/queue/move`, {
            method: 'POST',
            body: JSON.stringify({ id, toIndex })
        })
    }

    async moveCodexQueueItem(sessionId: string, id: string, toIndex: number): Promise<QueueResponse> {
        return await this.moveQueueItem(sessionId, id, toIndex)
    }

    async clearQueue(sessionId: string): Promise<QueueResponse> {
        return await this.request<QueueResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/queue/clear`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async clearCodexQueue(sessionId: string): Promise<QueueResponse> {
        return await this.clearQueue(sessionId)
    }

    async getUsageOverview(options?: { refresh?: boolean }): Promise<UsageOverviewResponse> {
        const params = new URLSearchParams()
        if (options?.refresh) {
            params.set('refresh', '1')
        }
        const qs = params.toString()
        return await this.request<UsageOverviewResponse>(`/api/usage/overview${qs ? `?${qs}` : ''}`)
    }

    async getSessionUsage(sessionId: string): Promise<SessionUsageResponse> {
        return await this.request<SessionUsageResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/usage`)
    }

    async searchSessionFiles(sessionId: string, query: string, limit?: number): Promise<FileSearchResponse> {
        const params = new URLSearchParams()
        if (query) {
            params.set('query', query)
        }
        if (limit !== undefined) {
            params.set('limit', `${limit}`)
        }
        const qs = params.toString()
        return await this.request<FileSearchResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/files${qs ? `?${qs}` : ''}`)
    }

    async readSessionFile(
        sessionId: string,
        path: string,
        options?: { maxBytes?: number }
    ): Promise<FileReadResponse> {
        const params = new URLSearchParams()
        params.set('path', path)
        if (typeof options?.maxBytes === 'number' && Number.isFinite(options.maxBytes)) {
            params.set('maxBytes', `${Math.max(0, Math.floor(options.maxBytes))}`)
        }
        return await this.request<FileReadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/file?${params.toString()}`)
    }

    async listSessionDirectory(sessionId: string, path?: string): Promise<ListDirectoryResponse> {
        const params = new URLSearchParams()
        if (path) {
            params.set('path', path)
        }

        const qs = params.toString()
        return await this.request<ListDirectoryResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/directory${qs ? `?${qs}` : ''}`
        )
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<UploadFileResponse> {
        return await this.request<UploadFileResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload`, {
            method: 'POST',
            body: JSON.stringify({ filename, content, mimeType })
        })
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<DeleteUploadResponse> {
        return await this.request<DeleteUploadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload/delete`, {
            method: 'POST',
            body: JSON.stringify({ path })
        })
    }

    async resumeSession(sessionId: string): Promise<string> {
        const response = await this.request<{ sessionId: string }>(
            `/api/sessions/${encodeURIComponent(sessionId)}/resume`,
            { method: 'POST' }
        )
        return response.sessionId
    }

    async spawnSessionFromExisting(sessionId: string, inheritHistory: boolean): Promise<SpawnResponse> {
        return await this.request<SpawnResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/spawn`,
            {
                method: 'POST',
                body: JSON.stringify({ inheritHistory })
            }
        )
    }

    async sendMessage(sessionId: string, text: string, localId?: string | null, attachments?: AttachmentMetadata[]): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                text,
                localId: localId ?? undefined,
                attachments: attachments ?? undefined
            })
        })
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async archiveSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async switchSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/switch`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permission-mode`, {
            method: 'POST',
            body: JSON.stringify({ mode })
        })
    }

    async setModel(sessionId: string, model: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/model`, {
            method: 'POST',
            body: JSON.stringify({ model })
        })
    }

    async setThinkEffort(
        sessionId: string,
        thinkEffort: 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
    ): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/think-effort`, {
            method: 'POST',
            body: JSON.stringify({ thinkEffort })
        })
    }

    async setServiceTier(
        sessionId: string,
        serviceTier: 'auto' | 'fast' | 'flex'
    ): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/service-tier`, {
            method: 'POST',
            body: JSON.stringify({ serviceTier })
        })
    }

    async setCollaborationMode(sessionId: string, mode: 'default' | 'plan'): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/collaboration-mode`, {
            method: 'POST',
            body: JSON.stringify({ mode })
        })
    }

    async setModelMode(sessionId: string, model: ModelMode): Promise<void> {
        await this.setModel(sessionId, model)
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        modeOrOptions?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | {
            mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
            allowTools?: string[]
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
            answers?: Record<string, string[]> | Record<string, { answers: string[] }>
        }
    ): Promise<void> {
        const body = typeof modeOrOptions === 'string' || modeOrOptions === undefined
            ? { mode: modeOrOptions }
            : modeOrOptions
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/approve`, {
            method: 'POST',
            body: JSON.stringify(body)
        })
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        options?: {
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
        }
    ): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/deny`, {
            method: 'POST',
            body: JSON.stringify(options ?? {})
        })
    }

    async getMachines(): Promise<MachinesResponse> {
        return await this.request<MachinesResponse>('/api/machines')
    }

    async checkMachinePathsExists(
        machineId: string,
        paths: string[]
    ): Promise<MachinePathsExistsResponse> {
        return await this.request<MachinePathsExistsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/paths/exists`,
            {
                method: 'POST',
                body: JSON.stringify({ paths })
            }
        )
    }

    async getMachineMappings(machineId: string): Promise<MachineMappingsResponse> {
        return await this.request<MachineMappingsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/mappings`
        )
    }

    async updateMachineMappings(machineId: string, mappings: MachineMappingsResponse['mappings']): Promise<MachineMappingsResponse> {
        return await this.request<MachineMappingsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/mappings`,
            {
                method: 'PUT',
                body: JSON.stringify({ mappings })
            }
        )
    }

    async importMachineMappingsFromNgrok(machineId: string): Promise<ImportMachineMappingsResponse> {
        return await this.request<ImportMachineMappingsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/mappings/import-ngrok`,
            {
                method: 'POST'
            }
        )
    }

    async createManagedMachineMapping(
        machineId: string,
        payload: {
            provider: 'ngrok' | 'manual' | 'cloudflared' | 'relay'
            name: string
            kind: 'vscode' | 'web' | 'jupyter' | 'ssh' | 'custom'
            localUrl: string
            auth?: { type: 'none' | 'basic-auth' | 'oauth' | 'oidc' | 'ip-restriction'; summary?: string }
        }
    ): Promise<MachineMappingsResponse> {
        return await this.request<MachineMappingsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/mappings/create`,
            {
                method: 'POST',
                body: JSON.stringify(payload)
            }
        )
    }

    async refreshMachineMappings(machineId: string): Promise<RefreshMachineMappingsResponse> {
        return await this.request<RefreshMachineMappingsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/mappings/refresh`,
            {
                method: 'POST'
            }
        )
    }

    async deleteManagedMachineMapping(
        machineId: string,
        payload: {
            provider: 'ngrok' | 'manual' | 'cloudflared' | 'relay'
            mapping: MachineMapping
        }
    ): Promise<MachineMappingsResponse> {
        return await this.request<MachineMappingsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/mappings`,
            {
                method: 'DELETE',
                body: JSON.stringify(payload)
            }
        )
    }

    async getProviderSettings(): Promise<ProviderSettingsResponse> {
        return await this.request<ProviderSettingsResponse>('/api/settings/providers')
    }

    async updateNgrokProviderSettings(payload: {
        enabled?: boolean
        managed?: boolean
        authToken?: string | null
        region?: string | null
        apiBaseUrl?: string | null
    }): Promise<UpdateProviderResponse> {
        return await this.request<UpdateProviderResponse>('/api/settings/providers/ngrok', {
            method: 'PUT',
            body: JSON.stringify(payload)
        })
    }

    async spawnSession(
        machineId: string,
        directory: string,
        agent?: 'claude' | 'codex' | 'gemini' | 'opencode',
        model?: string,
        thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh',
        serviceTier?: 'fast' | 'flex',
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        previewUrl?: string
    ): Promise<SpawnResponse> {
        return await this.request<SpawnResponse>(`/api/machines/${encodeURIComponent(machineId)}/spawn`, {
            method: 'POST',
            body: JSON.stringify({ directory, agent, model, thinkEffort, serviceTier, yolo, sessionType, worktreeName, previewUrl })
        })
    }

    async getSlashCommands(sessionId: string): Promise<SlashCommandsResponse> {
        return await this.request<SlashCommandsResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/slash-commands`
        )
    }

    async getSkills(sessionId: string): Promise<SkillsResponse> {
        return await this.request<SkillsResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/skills`
        )
    }

    async getSwarmSkills(swarmId: string): Promise<SwarmSkillsResponse> {
        return await this.request<SwarmSkillsResponse>(
            `/api/swarms/${encodeURIComponent(swarmId)}/skills`
        )
    }

    async getSessionMcpServers(sessionId: string): Promise<McpServersResponse> {
        return await this.request<McpServersResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/mcp`
        )
    }

    async renameSession(sessionId: string, name: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ name })
        })
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'DELETE'
        })
    }

    async fetchVoiceToken(options?: { customAgentId?: string; customApiKey?: string }): Promise<{
        allowed: boolean
        token?: string
        agentId?: string
        error?: string
    }> {
        return await this.request('/api/voice/token', {
            method: 'POST',
            body: JSON.stringify(options || {})
        })
    }
}
