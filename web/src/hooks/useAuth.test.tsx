import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth, type AuthSource } from './useAuth'

function mockJsonResponse(status: number, body: unknown, statusText: string = 'OK'): Response {
    return new Response(JSON.stringify(body), {
        status,
        statusText,
        headers: { 'content-type': 'application/json' }
    })
}

describe('useAuth', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('keeps browser auth source and avoids login redirect on transient auth failure', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        vi.stubGlobal('fetch', fetchMock)

        const authSource: AuthSource = { type: 'accessToken', token: 'cli-token' }
        const { result } = renderHook(() => useAuth(authSource, 'http://localhost:3016'))

        await waitFor(() => expect(result.current.isLoading).toBe(false))

        expect(result.current.token).toBeNull()
        expect(result.current.requiresLogin).toBe(false)
        expect(result.current.error).toContain('Failed to fetch')
    })

    it('requires login again only when access token is rejected', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse(401, { error: 'unauthorized' }, 'Unauthorized')
        )
        vi.stubGlobal('fetch', fetchMock)

        const authSource: AuthSource = { type: 'accessToken', token: 'cli-token' }
        const { result } = renderHook(() => useAuth(authSource, 'http://localhost:3016'))

        await waitFor(() => expect(result.current.isLoading).toBe(false))

        expect(result.current.token).toBeNull()
        expect(result.current.requiresLogin).toBe(true)
        expect(result.current.error).toContain('HTTP 401 Unauthorized')
    })
})
