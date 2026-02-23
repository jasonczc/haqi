import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
        metadata: {
            path: '/workspace/project-a',
            machineId: 'machine-1'
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        ...overrides
    }
}

describe('SessionList project quick-create action', () => {
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

    it('passes project directory and machineId when clicking group-level +', () => {
        const onNewSession = vi.fn()
        renderWithProviders(
            <SessionList
                sessions={[createSession()]}
                onSelect={vi.fn()}
                onNewSession={onNewSession}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'New Session in this project' }))

        expect(onNewSession).toHaveBeenCalledTimes(1)
        expect(onNewSession).toHaveBeenCalledWith({
            directory: '/workspace/project-a',
            machineId: 'machine-1'
        })
    })

    it('hides verbose metadata row in compact mode', () => {
        renderWithProviders(
            <SessionList
                sessions={[createSession()]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
                density="compact"
            />
        )

        expect(screen.queryByText(/mode:/i)).not.toBeInTheDocument()
    })

    it('does not render group-level + for the Other group', () => {
        const view = renderWithProviders(
            <SessionList
                sessions={[
                    createSession({
                        id: 'session-other',
                        metadata: null
                    })
                ]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        expect(view.queryByRole('button', { name: 'New Session in this project' })).not.toBeInTheDocument()
    })

    it('auto-collapses offline sessions and reveals them on demand', () => {
        renderWithProviders(
            <SessionList
                sessions={[
                    createSession({
                        id: 'online-1',
                        active: true,
                        metadata: {
                            path: '/repo/demo',
                            name: 'Online Session',
                            flavor: 'codex'
                        }
                    }),
                    createSession({
                        id: 'offline-1',
                        active: false,
                        metadata: {
                            path: '/repo/demo',
                            name: 'Offline Session',
                            flavor: 'codex'
                        }
                    })
                ]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        expect(screen.getByText('Online Session')).toBeInTheDocument()
        expect(screen.queryByText('Offline Session')).not.toBeInTheDocument()

        const offlineToggle = screen
            .getAllByRole('button', { name: /offline/i })
            .find((button) => button.hasAttribute('aria-expanded'))

        expect(offlineToggle).toBeDefined()
        if (!offlineToggle) {
            throw new Error('offline section toggle not found')
        }
        expect(offlineToggle).toHaveAttribute('aria-expanded', 'false')

        fireEvent.click(offlineToggle)

        expect(offlineToggle).toHaveAttribute('aria-expanded', 'true')
    })

    it('can mark project offline and pull it back by creating a new session', () => {
        const onNewSession = vi.fn()
        renderWithProviders(
            <SessionList
                sessions={[
                    createSession({
                        id: 'online-project',
                        active: true,
                        metadata: {
                            path: '/repo/active-project',
                            name: 'Active Project Session',
                            machineId: 'machine-1',
                            flavor: 'codex'
                        }
                    })
                ]}
                onSelect={vi.fn()}
                onNewSession={onNewSession}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        const groupTitle = screen.getByTitle('/repo/active-project')
        const groupRowToggle = groupTitle.closest('button')
        expect(groupRowToggle).toBeTruthy()
        if (!groupRowToggle) {
            throw new Error('group row toggle not found')
        }

        fireEvent.contextMenu(groupRowToggle)
        fireEvent.click(screen.getByRole('menuitem', { name: 'Mark project offline' }))
        expect(screen.getByRole('button', { name: /offline projects/i })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'New Session in this project' }))
        expect(onNewSession).toHaveBeenCalledWith({
            directory: '/repo/active-project',
            machineId: 'machine-1'
        })
    })
})
