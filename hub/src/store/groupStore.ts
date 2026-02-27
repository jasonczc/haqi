import type { Database } from 'bun:sqlite'

import {
    addGroupMember,
    addGroupMessage,
    addGroupTask,
    countOpenGroupTasksForSession,
    createGroup,
    deleteGroup,
    getAllGroups,
    getGroup,
    getGroupByNamespace,
    getGroupMembersByNamespace,
    getGroupMessageByNamespace,
    getGroupMessages,
    getGroupTasks,
    getGroupsByNamespace,
    getGroupNote,
    getGroupTaskByDedupeKey,
    getGroupTaskByNamespace,
    removeGroupMember,
    updateGroup,
    updateGroupNote,
    updateGroupTaskStatus
} from './groups'
import type { StoredGroup, StoredGroupMember, StoredGroupMessage, StoredGroupNote, StoredGroupTask } from './types'

export class GroupStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    createGroup(options: {
        namespace: string
        name: string
        description?: string | null
        noteSessionId?: string | null
        members?: Array<{
            memberType: 'session' | 'human'
            sessionId?: string | null
            userId?: number | null
            role?: string
        }>
    }): StoredGroup {
        return createGroup(this.db, options)
    }

    deleteGroup(options: {
        groupId: string
        namespace: string
    }): boolean {
        return deleteGroup(this.db, options)
    }

    getGroupsByNamespace(namespace: string): StoredGroup[] {
        return getGroupsByNamespace(this.db, namespace)
    }

    getAllGroups(): StoredGroup[] {
        return getAllGroups(this.db)
    }

    getGroup(groupId: string): StoredGroup | null {
        return getGroup(this.db, groupId)
    }

    getGroupByNamespace(groupId: string, namespace: string): StoredGroup | null {
        return getGroupByNamespace(this.db, groupId, namespace)
    }

    getGroupMembersByNamespace(groupId: string, namespace: string): StoredGroupMember[] {
        return getGroupMembersByNamespace(this.db, groupId, namespace)
    }

    addGroupMember(options: {
        groupId: string
        namespace: string
        sessionId: string
        role?: string
    }): StoredGroupMember {
        return addGroupMember(this.db, options)
    }

    removeGroupMember(options: {
        groupId: string
        namespace: string
        sessionId: string
    }): boolean {
        return removeGroupMember(this.db, options)
    }

    updateGroup(options: {
        groupId: string
        namespace: string
        name?: string
        description?: string | null
        noteSessionId?: string | null
    }): StoredGroup | null {
        return updateGroup(this.db, options)
    }

    addGroupMessage(options: {
        groupId: string
        namespace: string
        type: 'chat' | 'command' | 'task_state' | 'note_state' | 'system'
        traceId?: string | null
        taskId?: string | null
        source: string
        actorSessionId?: string | null
        actorName?: string | null
        targetSessionIds?: string[] | null
        quotedMessageId?: string | null
        payload: unknown
    }): StoredGroupMessage {
        return addGroupMessage(this.db, options)
    }

    getGroupMessageByNamespace(groupId: string, namespace: string, messageId: string): StoredGroupMessage | null {
        return getGroupMessageByNamespace(this.db, groupId, namespace, messageId)
    }

    getGroupMessages(groupId: string, namespace: string, limit?: number, beforeSeq?: number): StoredGroupMessage[] {
        return getGroupMessages(this.db, groupId, namespace, limit, beforeSeq)
    }

    getGroupTasks(groupId: string, namespace: string, limit?: number): StoredGroupTask[] {
        return getGroupTasks(this.db, groupId, namespace, limit)
    }

    getGroupNote(groupId: string, namespace: string): StoredGroupNote | null {
        return getGroupNote(this.db, groupId, namespace)
    }

    updateGroupNote(options: {
        groupId: string
        namespace: string
        content: string
        updatedBy?: string | null
    }): StoredGroupNote {
        return updateGroupNote(this.db, options)
    }

    addGroupTask(options: {
        groupId: string
        namespace: string
        traceId: string
        source: string
        targetSessionId: string
        command: string
        status?: 'pending' | 'enqueued' | 'running' | 'completed' | 'failed' | 'expired' | 'canceled' | 'manual_done'
        dedupeKey?: string | null
        expiresAt?: number | null
    }): StoredGroupTask {
        return addGroupTask(this.db, options)
    }

    getGroupTaskByNamespace(groupId: string, taskId: string, namespace: string): StoredGroupTask | null {
        return getGroupTaskByNamespace(this.db, groupId, taskId, namespace)
    }

    getGroupTaskByDedupeKey(groupId: string, namespace: string, dedupeKey: string): StoredGroupTask | null {
        return getGroupTaskByDedupeKey(this.db, groupId, namespace, dedupeKey)
    }

    countOpenGroupTasksForSession(groupId: string, targetSessionId: string, namespace: string): number {
        return countOpenGroupTasksForSession(this.db, groupId, targetSessionId, namespace)
    }

    updateGroupTaskStatus(options: {
        groupId: string
        taskId: string
        namespace: string
        status: 'pending' | 'enqueued' | 'running' | 'completed' | 'failed' | 'expired' | 'canceled' | 'manual_done'
        error?: string | null
    }): StoredGroupTask | null {
        return updateGroupTaskStatus(this.db, options)
    }
}
