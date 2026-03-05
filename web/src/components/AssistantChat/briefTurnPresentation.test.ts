import { describe, expect, it } from 'vitest'
import {
    isBriefTurnLive,
    shouldFetchLatestTurnChangesSummary,
    shouldShowLatestBriefTurnAsFullContent
} from './briefTurnPresentation'

describe('brief turn presentation', () => {
    it('latest closed turn uses full content (non-card) even when thinking', () => {
        const isLiveTurn = isBriefTurnLive({
            status: 'closed',
            thinking: true,
            isActiveStreamingTurn: true
        })

        expect(isLiveTurn).toBe(false)
        expect(shouldShowLatestBriefTurnAsFullContent({
            isLatestTurn: true,
            isLiveTurn
        })).toBe(true)
    })

    it('latest open streaming turn keeps card presentation', () => {
        const isLiveTurn = isBriefTurnLive({
            status: 'open',
            thinking: true,
            isActiveStreamingTurn: true
        })

        expect(isLiveTurn).toBe(true)
        expect(shouldShowLatestBriefTurnAsFullContent({
            isLatestTurn: true,
            isLiveTurn
        })).toBe(false)
    })

    it('non-latest turn never uses latest full-content presentation', () => {
        expect(shouldShowLatestBriefTurnAsFullContent({
            isLatestTurn: false,
            isLiveTurn: false
        })).toBe(false)
    })

    it('fetches turn changes for latest turn even when turn is open (regression)', () => {
        expect(shouldFetchLatestTurnChangesSummary({
            latestTurnId: 'turn-1',
            latestTurnUpdatedAt: 100,
            fetchedUpdatedAtByTurnId: {},
            inFlightTurnIds: new Set()
        })).toBe(true)
    })

    it('does not fetch when same updatedAt already fetched', () => {
        expect(shouldFetchLatestTurnChangesSummary({
            latestTurnId: 'turn-1',
            latestTurnUpdatedAt: 100,
            fetchedUpdatedAtByTurnId: { 'turn-1': 100 },
            inFlightTurnIds: new Set()
        })).toBe(false)
    })

    it('re-fetches when latest turn updatedAt changes', () => {
        expect(shouldFetchLatestTurnChangesSummary({
            latestTurnId: 'turn-1',
            latestTurnUpdatedAt: 101,
            fetchedUpdatedAtByTurnId: { 'turn-1': 100 },
            inFlightTurnIds: new Set()
        })).toBe(true)
    })

    it('does not fetch while in-flight', () => {
        expect(shouldFetchLatestTurnChangesSummary({
            latestTurnId: 'turn-1',
            latestTurnUpdatedAt: 100,
            fetchedUpdatedAtByTurnId: {},
            inFlightTurnIds: new Set(['turn-1'])
        })).toBe(false)
    })
})
