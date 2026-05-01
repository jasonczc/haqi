import { describe, expect, it } from 'vitest'
import { buildRendererPath, buildRendererUrl, findDeepLinkArg, parseDeepLink } from './deepLink'

describe('desktop deep links', () => {
    it('maps code/new folder links to new-session routes', () => {
        const route = parseDeepLink('haqi://code/new?folder=%2Ftmp%2Frepo')

        expect(route).toEqual({
            kind: 'new-session',
            directory: '/tmp/repo'
        })
        expect(buildRendererPath(route)).toBe('/sessions/new?directory=%2Ftmp%2Frepo')
    })

    it('falls back to sessions for empty or unsupported links', () => {
        expect(parseDeepLink(null)).toEqual({ kind: 'sessions' })
        expect(parseDeepLink('haqi://sessions')).toEqual({ kind: 'sessions' })
        expect(parseDeepLink('https://example.com')).toEqual({ kind: 'sessions' })
        expect(parseDeepLink('haqi://code/new')).toEqual({ kind: 'sessions' })
    })

    it('finds a haqi protocol argument in a command line', () => {
        expect(findDeepLinkArg(['HAQI.exe', '--flag', 'haqi://sessions'])).toBe('haqi://sessions')
        expect(findDeepLinkArg(['HAQI.exe', '--flag'])).toBeNull()
    })

    it('builds absolute renderer URLs', () => {
        expect(
            buildRendererUrl('http://127.0.0.1:3006', {
                kind: 'new-session',
                directory: '/tmp/repo with spaces'
            })
        ).toBe('http://127.0.0.1:3006/sessions/new?directory=%2Ftmp%2Frepo+with+spaces')
    })
})
