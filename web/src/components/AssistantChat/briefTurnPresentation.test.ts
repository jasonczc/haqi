import { describe, expect, it } from 'vitest'
import { isBriefTurnLive, shouldShowLatestBriefTurnAsFullContent } from './briefTurnPresentation'

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
})
