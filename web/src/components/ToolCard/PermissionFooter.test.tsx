// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ApiClient } from '@/api/client'
import type { ChatToolCall } from '@/chat/types'
import type { SessionMetadataSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { PermissionFooter } from '@/components/ToolCard/PermissionFooter'

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
        name: 'ExitPlanMode',
        state: 'pending',
        input: {
            text: '- Inspect current flow\n- Confirm plan\n- Implement'
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

const metadata: SessionMetadataSummary = {
    path: '/tmp/project',
    host: 'local',
    flavor: 'codex'
}

describe('PermissionFooter', () => {
    afterEach(() => {
        cleanup()
    })

    it('renders plan-specific actions for ExitPlanMode', () => {
        const api = {
            approvePermission: vi.fn(),
            denyPermission: vi.fn()
        } as unknown as ApiClient

        renderWithProviders(
            <PermissionFooter
                api={api}
                sessionId="session-1"
                metadata={metadata}
                tool={makeTool()}
                disabled={false}
                onDone={vi.fn()}
            />
        )

        expect(screen.getByText('Review the proposed plan below and choose whether to continue.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Approve plan' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Keep planning' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Yes for session' })).not.toBeInTheDocument()
    })

    it('approves the plan with a codex decision payload', async () => {
        const approvePermission = vi.fn(async () => undefined)
        const api = {
            approvePermission,
            denyPermission: vi.fn()
        } as unknown as ApiClient

        renderWithProviders(
            <PermissionFooter
                api={api}
                sessionId="session-1"
                metadata={metadata}
                tool={makeTool()}
                disabled={false}
                onDone={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Approve plan' }))

        await waitFor(() => {
            expect(approvePermission).toHaveBeenCalledWith('session-1', 'perm-1', {
                decision: 'approved'
            })
        })
    })
})
