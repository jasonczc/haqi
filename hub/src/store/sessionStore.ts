import type { Database } from 'bun:sqlite'

import type { PreviewUrlHistoryEntry, StoredSession, VersionedUpdateResult } from './types'
import {
    getPreviewUrlHistory,
    deleteSession,
    getOrCreateSession,
    getSession,
    getSessionByNamespace,
    getSessions,
    getSessionsByNamespace,
<<<<<<< HEAD
    setSessionPreviewUrl,
=======
    setSessionTeamState,
>>>>>>> 06b71db (feat: Add Claude Code Agent Teams support (#258))
    setSessionTodos,
    updateSessionAgentState,
    updateSessionMetadata
} from './sessions'

export class SessionStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, namespace: string): StoredSession {
        return getOrCreateSession(this.db, tag, metadata, agentState, namespace)
    }

    updateSessionMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number,
        namespace: string,
        options?: { touchUpdatedAt?: boolean }
    ): VersionedUpdateResult<unknown | null> {
        return updateSessionMetadata(this.db, id, metadata, expectedVersion, namespace, options)
    }

    updateSessionAgentState(
        id: string,
        agentState: unknown,
        expectedVersion: number,
        namespace: string
    ): VersionedUpdateResult<unknown | null> {
        return updateSessionAgentState(this.db, id, agentState, expectedVersion, namespace)
    }

    setSessionTodos(id: string, todos: unknown, todosUpdatedAt: number, namespace: string): boolean {
        return setSessionTodos(this.db, id, todos, todosUpdatedAt, namespace)
    }

<<<<<<< HEAD
    setSessionPreviewUrl(id: string, previewUrl: string | null, namespace: string): boolean {
        return setSessionPreviewUrl(this.db, id, previewUrl, namespace)
    }

    getPreviewUrlHistory(namespace: string, limit?: number): PreviewUrlHistoryEntry[] {
        return getPreviewUrlHistory(this.db, namespace, limit)
=======
    setSessionTeamState(id: string, teamState: unknown, updatedAt: number, namespace: string): boolean {
        return setSessionTeamState(this.db, id, teamState, updatedAt, namespace)
>>>>>>> 06b71db (feat: Add Claude Code Agent Teams support (#258))
    }

    getSession(id: string): StoredSession | null {
        return getSession(this.db, id)
    }

    getSessionByNamespace(id: string, namespace: string): StoredSession | null {
        return getSessionByNamespace(this.db, id, namespace)
    }

    getSessions(): StoredSession[] {
        return getSessions(this.db)
    }

    getSessionsByNamespace(namespace: string): StoredSession[] {
        return getSessionsByNamespace(this.db, namespace)
    }

    deleteSession(id: string, namespace: string): boolean {
        return deleteSession(this.db, id, namespace)
    }
}
