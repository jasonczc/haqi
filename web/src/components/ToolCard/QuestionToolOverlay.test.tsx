// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ApiClient } from '@/api/client'
import type { ChatToolCall } from '@/chat/types'
import { I18nProvider } from '@/lib/i18n-context'
import {
    QuestionToolOverlay,
    resetQuestionToolOverlayDraftsForTest
} from '@/components/ToolCard/QuestionToolOverlay'

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

function makeTool(): ChatToolCall {
    return {
        id: 'tool-1',
        name: 'request_user_input',
        state: 'pending',
        input: {
            questions: [
                {
                    id: 'mode',
                    header: 'Execution',
                    question: 'How should we proceed?',
                    options: [
                        { label: 'Ship it', description: 'Apply immediately' },
                        { label: 'Hold', description: 'Wait for review' }
                    ]
                }
            ]
        },
        createdAt: 0,
        startedAt: null,
        completedAt: null,
        description: null,
        permission: {
            id: 'perm-1',
            status: 'pending'
        }
    }
}

describe('QuestionToolOverlay', () => {
    afterEach(() => {
        resetQuestionToolOverlayDraftsForTest()
        cleanup()
    })

    beforeEach(() => {
        const storage = new Map<string, string>()
        const localStorageStub = {
            getItem: vi.fn((key: string) => storage.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => {
                storage.set(key, value)
            }),
            removeItem: vi.fn((key: string) => {
                storage.delete(key)
            }),
            clear: vi.fn(() => {
                storage.clear()
            })
        }
        Object.defineProperty(window, 'localStorage', {
            writable: true,
            value: localStorageStub
        })
        Object.defineProperty(globalThis, 'localStorage', {
            writable: true,
            value: localStorageStub
        })
        window.localStorage.setItem('hapi-lang', 'en')
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation(() => ({
                matches: false,
                media: '',
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        })
        Object.defineProperty(navigator, 'vibrate', {
            writable: true,
            value: vi.fn()
        })
    })

    it('submits the default first option without extra clicks', async () => {
        const approvePermission = vi.fn(async () => undefined)
        const api = {
            approvePermission,
            denyPermission: vi.fn()
        } as unknown as ApiClient
        const onDone = vi.fn()

        renderWithProviders(
            <QuestionToolOverlay
                api={api}
                sessionId="session-1"
                tool={makeTool()}
                disabled={false}
                onDone={onDone}
            />
        )

        expect(screen.getByText('Execution')).toBeInTheDocument()
        expect(screen.getByText('How should we proceed?')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => {
            expect(approvePermission).toHaveBeenCalledWith('session-1', 'perm-1', {
                answers: {
                    mode: {
                        answers: ['Ship it']
                    }
                }
            })
        })
        expect(onDone).toHaveBeenCalled()
    })

    it('aborts the request when the close button is pressed', async () => {
        const denyPermission = vi.fn(async () => undefined)
        const api = {
            approvePermission: vi.fn(),
            denyPermission
        } as unknown as ApiClient

        renderWithProviders(
            <QuestionToolOverlay
                api={api}
                sessionId="session-1"
                tool={makeTool()}
                disabled={false}
                onDone={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() => {
            expect(denyPermission).toHaveBeenCalledWith('session-1', 'perm-1', {
                decision: 'abort'
            })
        })
    })

    it('restores draft answers after unmount and remount', async () => {
        const approvePermission = vi.fn(async () => undefined)
        const api = {
            approvePermission,
            denyPermission: vi.fn()
        } as unknown as ApiClient

        const firstRender = renderWithProviders(
            <QuestionToolOverlay
                api={api}
                sessionId="session-1"
                tool={makeTool()}
                disabled={false}
                onDone={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: /Hold/ }))
        firstRender.unmount()

        renderWithProviders(
            <QuestionToolOverlay
                api={api}
                sessionId="session-1"
                tool={makeTool()}
                disabled={false}
                onDone={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => {
            expect(approvePermission).toHaveBeenCalledWith('session-1', 'perm-1', {
                answers: {
                    mode: {
                        answers: ['Hold']
                    }
                }
            })
        })
    })
})
