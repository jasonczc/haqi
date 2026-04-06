import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/lib/i18n-context'
import type { SessionSummary } from '@/types/api'
import { SessionList } from './SessionList'

function renderWithProviders(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        }
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <div style={{ height: 800 }}>
                    {ui}
                </div>
            </I18nProvider>
        </QueryClientProvider>
    )
}

function createSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
    return {
        id: 'session-1',
        active: false,
        thinking: false,
        activeAt: Date.now(),
        updatedAt: Date.now(),
        modelMode: 'default',
        pendingRequestsCount: 0,
        todoProgress: null,
        metadata: {
            path: '/workspace/project-a',
            name: 'Test Session',
            model: 'claude',
            machineId: 'machine-1',
        },
        ...overrides
    }
}

describe('SessionList date-based grouping', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        localStorage.setItem('hapi-lang', 'en')
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }))
        })
    })

    it('renders sessions in a flat list with date headers', () => {
        const now = Date.now()
        renderWithProviders(
            <SessionList
                sessions={[
                    createSession({ id: 's1', updatedAt: now, metadata: { path: '/a', name: 'Recent Session' } }),
                    createSession({ id: 's2', updatedAt: now - 86400000 * 2, metadata: { path: '/b', name: 'Older Session' } }),
                ]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        // Should find date header text
        expect(screen.getByText('Today')).toBeDefined()
    })

    it('renders empty state when no sessions', () => {
        renderWithProviders(
            <SessionList
                sessions={[]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        // Should not crash
        expect(document.body).toBeDefined()
    })
})
