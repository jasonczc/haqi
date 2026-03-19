// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { PlanApprovalOverlay } from '@/components/ToolCard/PlanApprovalOverlay'
import type { ApiClient } from '@/api/client'
import type { ChatToolCall } from '@/chat/types'
import type { SessionMetadataSummary } from '@/types/api'

const metadata: SessionMetadataSummary = {
    path: '/tmp/project',
    host: 'local',
    flavor: 'codex'
}

function makeTool(): ChatToolCall {
    return {
        id: 'tool-1',
        name: 'ExitPlanMode',
        state: 'pending',
        input: {},
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

describe('PlanApprovalOverlay', () => {
    it('renders approval popup for pending ExitPlanMode', () => {
        render(
            <I18nProvider>
                <PlanApprovalOverlay
                    api={{ approvePermission: vi.fn(), denyPermission: vi.fn() } as unknown as ApiClient}
                    sessionId="session-1"
                    metadata={metadata}
                    tool={makeTool()}
                    disabled={false}
                    onDone={vi.fn()}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Plan approval')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Approve plan' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reject plan' })).toBeInTheDocument()
    })
})
