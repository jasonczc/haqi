import type { AttachmentMetadata, DecryptedMessage } from '@hapi/protocol/types'
import type { Server } from 'socket.io'
import type { Store } from '../store'
import { EventPublisher } from './eventPublisher'

export class MessageService {
    constructor(
        private readonly store: Store,
        private readonly io: Server,
        private readonly publisher: EventPublisher
    ) {
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        const stored = this.store.messages.getMessages(sessionId, options.limit, options.beforeSeq ?? undefined)
        const messages: DecryptedMessage[] = stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt
        }))

        let oldestSeq: number | null = null
        for (const message of messages) {
            if (typeof message.seq !== 'number') continue
            if (oldestSeq === null || message.seq < oldestSeq) {
                oldestSeq = message.seq
            }
        }

        const nextBeforeSeq = oldestSeq
        const hasMore = nextBeforeSeq !== null
            && this.store.messages.getMessages(sessionId, 1, nextBeforeSeq).length > 0

        return {
            messages,
            page: {
                limit: options.limit,
                beforeSeq: options.beforeSeq,
                nextBeforeSeq,
                hasMore
            }
        }
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        const stored = this.store.messages.getMessagesAfter(sessionId, options.afterSeq, options.limit)
        return stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt
        }))
    }

    getConversationTurnsPage(sessionId: string, options: { limit: number; beforeTurnIndex: number | null }): {
        turns: Array<{
            id: string
            sessionId: string
            turnIndex: number
            status: 'open' | 'closed'
            userMessageId: string | null
            userSeq: number | null
            agentStartSeq: number | null
            agentEndSeq: number | null
            messageCount: number
            userPreview: string | null
            assistantPreview: string | null
            createdAt: number
            updatedAt: number
        }>
        page: {
            limit: number
            beforeTurnIndex: number | null
            nextBeforeTurnIndex: number | null
            hasMore: boolean
        }
    } {
        const stored = this.store.turns.getTurns(sessionId, options.limit, options.beforeTurnIndex ?? undefined)
        const turns = stored.map((turn) => ({
            id: turn.id,
            sessionId: turn.sessionId,
            turnIndex: turn.turnIndex,
            status: turn.status,
            userMessageId: turn.userMessageId,
            userSeq: turn.userSeq,
            agentStartSeq: turn.agentStartSeq,
            agentEndSeq: turn.agentEndSeq,
            messageCount: turn.messageCount,
            userPreview: turn.userPreview,
            assistantPreview: turn.assistantPreview,
            createdAt: turn.createdAt,
            updatedAt: turn.updatedAt
        }))

        let oldestTurnIndex: number | null = null
        for (const turn of turns) {
            if (oldestTurnIndex === null || turn.turnIndex < oldestTurnIndex) {
                oldestTurnIndex = turn.turnIndex
            }
        }

        const nextBeforeTurnIndex = oldestTurnIndex
        const hasMore = nextBeforeTurnIndex !== null
            && this.store.turns.getTurns(sessionId, 1, nextBeforeTurnIndex).length > 0

        return {
            turns,
            page: {
                limit: options.limit,
                beforeTurnIndex: options.beforeTurnIndex,
                nextBeforeTurnIndex,
                hasMore
            }
        }
    }

    getConversationTurnMessagesPage(
        sessionId: string,
        turnId: string,
        options: { limit: number; beforeSeq: number | null }
    ): {
        turn: {
            id: string
            sessionId: string
            turnIndex: number
            status: 'open' | 'closed'
            userMessageId: string | null
            userSeq: number | null
            agentStartSeq: number | null
            agentEndSeq: number | null
            messageCount: number
            userPreview: string | null
            assistantPreview: string | null
            createdAt: number
            updatedAt: number
        }
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
            startSeq: number | null
            endSeq: number | null
        }
    } | null {
        const stored = this.store.turns.getTurnMessagesPage(sessionId, turnId, options)
        if (!stored) {
            return null
        }

        const messages: DecryptedMessage[] = stored.messages.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt
        }))

        return {
            turn: {
                id: stored.turn.id,
                sessionId: stored.turn.sessionId,
                turnIndex: stored.turn.turnIndex,
                status: stored.turn.status,
                userMessageId: stored.turn.userMessageId,
                userSeq: stored.turn.userSeq,
                agentStartSeq: stored.turn.agentStartSeq,
                agentEndSeq: stored.turn.agentEndSeq,
                messageCount: stored.turn.messageCount,
                userPreview: stored.turn.userPreview,
                assistantPreview: stored.turn.assistantPreview,
                createdAt: stored.turn.createdAt,
                updatedAt: stored.turn.updatedAt
            },
            messages,
            page: stored.page
        }
    }

    async sendMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: AttachmentMetadata[]
            sentFrom?: 'telegram-bot' | 'webapp'
            meta?: Record<string, unknown>
        }
    ): Promise<void> {
        const sentFrom = payload.sentFrom ?? 'webapp'

        const content = {
            role: 'user',
            content: {
                type: 'text',
                text: payload.text,
                attachments: payload.attachments
            },
            meta: {
                ...payload.meta,
                sentFrom
            }
        }

        const msg = this.store.messages.addMessage(sessionId, content, payload.localId ?? undefined)

        const update = {
            id: msg.id,
            seq: msg.seq,
            createdAt: msg.createdAt,
            body: {
                t: 'new-message' as const,
                sid: sessionId,
                message: {
                    id: msg.id,
                    seq: msg.seq,
                    createdAt: msg.createdAt,
                    localId: msg.localId,
                    content: msg.content
                }
            }
        }
        this.io.of('/cli').to(`session:${sessionId}`).emit('update', update)

        this.publisher.emit({
            type: 'message-received',
            sessionId,
            message: {
                id: msg.id,
                seq: msg.seq,
                localId: msg.localId,
                content: msg.content,
                createdAt: msg.createdAt
            }
        })
    }
}
