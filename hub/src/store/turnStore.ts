import type { Database } from 'bun:sqlite'

import type { StoredConversationTurn, StoredMessage } from './types'
import {
    appendMessageToConversationTurns,
    getConversationTurnById,
    getConversationTurnMessagesPage,
    getConversationTurns,
    rebuildAllConversationTurns,
    rebuildSessionConversationTurns
} from './turns'

export class TurnStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    appendMessage(message: StoredMessage): StoredConversationTurn {
        return appendMessageToConversationTurns(this.db, message)
    }

    getTurns(sessionId: string, limit: number = 200, beforeTurnIndex?: number): StoredConversationTurn[] {
        return getConversationTurns(this.db, sessionId, limit, beforeTurnIndex)
    }

    getTurnById(sessionId: string, turnId: string): StoredConversationTurn | null {
        return getConversationTurnById(this.db, sessionId, turnId)
    }

    getTurnMessagesPage(
        sessionId: string,
        turnId: string,
        options: { limit: number; beforeSeq: number | null }
    ): {
        turn: StoredConversationTurn
        messages: StoredMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
            startSeq: number | null
            endSeq: number | null
        }
    } | null {
        return getConversationTurnMessagesPage(this.db, sessionId, turnId, options)
    }

    rebuildSessionTurns(sessionId: string): number {
        return rebuildSessionConversationTurns(this.db, sessionId)
    }

    rebuildAllTurns(): number {
        return rebuildAllConversationTurns(this.db)
    }
}
