import { describe, expect, it } from 'vitest'
import { applyRateLimitEvent } from './rateLimitSnapshot'

describe('applyRateLimitEvent', () => {
    it('writes a known rateLimitType into an empty snapshot', () => {
        const result = applyRateLimitEvent(undefined, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 0.18,
            resetsAt: 1777282200
        }, 1_000)

        expect(result).toEqual({
            five_hour: {
                status: 'allowed',
                utilization: 0.18,
                resetsAt: 1777282200,
                observedAt: 1_000
            }
        })
    })

    it('preserves entries for other rateLimitType values', () => {
        const initial = applyRateLimitEvent(undefined, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 0.18
        }, 1_000)

        const merged = applyRateLimitEvent(initial, {
            status: 'allowed_warning',
            rateLimitType: 'seven_day',
            utilization: 0.7,
            resetsAt: 1_700_000_000
        }, 2_000)

        expect(merged.five_hour).toEqual(initial.five_hour)
        expect(merged.seven_day).toEqual({
            status: 'allowed_warning',
            utilization: 0.7,
            resetsAt: 1_700_000_000,
            observedAt: 2_000
        })
    })

    it('overwrites the entry for the same rateLimitType', () => {
        const initial = applyRateLimitEvent(undefined, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 0.18
        }, 1_000)

        const updated = applyRateLimitEvent(initial, {
            status: 'rejected',
            rateLimitType: 'five_hour',
            resetsAt: 1_900_000_000
        }, 5_000)

        expect(updated.five_hour).toEqual({
            status: 'rejected',
            resetsAt: 1_900_000_000,
            observedAt: 5_000
        })
    })

    it('drops out-of-range utilization and missing optional fields', () => {
        const result = applyRateLimitEvent(undefined, {
            status: 'allowed',
            rateLimitType: 'seven_day_sonnet',
            utilization: 1.5
        }, 1_000)

        expect(result.seven_day_sonnet).toEqual({
            status: 'allowed',
            observedAt: 1_000
        })
    })

    it('captures overage fields when present', () => {
        const result = applyRateLimitEvent(undefined, {
            status: 'rejected',
            rateLimitType: 'overage',
            overageStatus: 'rejected',
            isUsingOverage: false
        }, 1_000)

        expect(result.overage).toEqual({
            status: 'rejected',
            observedAt: 1_000,
            overageStatus: 'rejected',
            isUsingOverage: false
        })
    })

    it('returns the snapshot unchanged when rateLimitType is unknown or missing', () => {
        const initial = applyRateLimitEvent(undefined, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 0.1
        }, 1_000)

        const unknown = applyRateLimitEvent(initial, {
            status: 'allowed',
            rateLimitType: 'made_up_type'
        }, 9_999)
        expect(unknown).toBe(initial)

        const missing = applyRateLimitEvent(initial, {
            status: 'allowed'
        }, 9_999)
        expect(missing).toBe(initial)
    })
})
