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
    MachinePathsExistsResponse,
    MachinesResponse,
    MessagesResponse,
    GroupMessagesResponse,
    GroupTasksResponse,
    GroupNoteResponse,
    UpdateGroupNoteResponse,
    RefreshGroupNoteResponse,
    GroupTaskActionResponse,
    GroupsResponse,
    GroupResponse,
    MemoryResponse,
    UpdateMemoryResponse,
    CreateGroupResponse,
    AddGroupMemberResponse,
    UpdateGroupResponse,
    PostGroupMessageResponse,
    ModelMode,
    PermissionMode,
    PreviewUrlHistoryResponse,
    PushSubscriptionPayload,
    PushUnsubscribePayload,
    PushVapidPublicKeyResponse,
    SlashCommandsResponse,
    SkillsResponse,
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

    async updateGroup(groupId: string, payload: {
        name?: string
        description?: string | null
        noteSessionId?: string | null
    }): Promise<UpdateGroupResponse> {
        return await this.request<UpdateGroupResponse>(
            `/api/groups/${encodeURIComponent(groupId)}`,
            {
                method: 'PATCH',
                body: JSON.stringify(payload)
            }
        )
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

    async postGroupMessage(groupId: string, payload: {
        type: 'chat' | 'command' | 'task_state' | 'note_state' | 'system'
        payload?: unknown
        text?: string
        traceId?: string
        taskId?: string
        source?: string
        actorSessionId?: string
        actorName?: string
        targetSessionIds?: string[]
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

    async updateMemory(payload: { content: string; updatedBy?: string }): Promise<UpdateMemoryResponse> {
        return await this.request<UpdateMemoryResponse>('/api/memory', {
            method: 'PATCH',
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

    async spawnSession(
        machineId: string,
        directory: string,
        agent?: 'claude' | 'codex' | 'gemini' | 'opencode',
        model?: string,
        thinkEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh',
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        previewUrl?: string
    ): Promise<SpawnResponse> {
        return await this.request<SpawnResponse>(`/api/machines/${encodeURIComponent(machineId)}/spawn`, {
            method: 'POST',
            body: JSON.stringify({ directory, agent, model, thinkEffort, yolo, sessionType, worktreeName, previewUrl })
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
