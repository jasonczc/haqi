import type React from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HappyThread } from './HappyThread'
import { I18nProvider } from '@/lib/i18n-context'

vi.mock('@assistant-ui/react', () => ({
    ThreadPrimitive: {
        Root: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
        Viewport: (props: { asChild?: boolean; children: React.ReactNode }) => props.asChild ? <>{props.children}</> : <div>{props.children}</div>,
        Messages: () => <div data-testid="thread-messages" />
    }
}))

function renderThread(override: Partial<React.ComponentProps<typeof HappyThread>> = {}) {
    return render(
        <I18nProvider>
            <HappyThread
                api={{} as never}
                sessionId="session-1"
                metadata={null}
                agentState={null}
                permissionMode="default"
                disabled={false}
                onRefresh={() => {}}
                onRetryMessage={() => {}}
                onFlushPending={() => {}}
                onAtBottomChange={() => {}}
                isLoadingMessages={false}
                messagesWarning={null}
                hasMoreMessages={false}
                isLoadingMoreMessages={false}
                onLoadMore={async () => {}}
                pendingCount={0}
                rawMessagesCount={10}
                normalizedMessagesCount={10}
                messagesVersion={1}
                forceScrollToken={0}
                density="comfortable"
                {...override}
            />
        </I18nProvider>
    )
}

describe('HappyThread auto-scroll', () => {
    it('keeps viewport pinned to bottom when newer messages arrive after initial render', async () => {
        const view = renderThread()
        const viewport = view.container.querySelector('.app-scrollbar') as HTMLDivElement

        expect(viewport).toBeTruthy()

        Object.defineProperty(viewport, 'scrollHeight', {
            configurable: true,
            writable: true,
            value: 400
        })
        viewport.scrollTop = 400

        view.rerender(
            <I18nProvider>
                <HappyThread
                    api={{} as never}
                    sessionId="session-1"
                    metadata={null}
                    agentState={null}
                    permissionMode="default"
                    disabled={false}
                    onRefresh={() => {}}
                    onRetryMessage={() => {}}
                    onFlushPending={() => {}}
                    onAtBottomChange={() => {}}
                    isLoadingMessages={false}
                    messagesWarning={null}
                    hasMoreMessages={false}
                    isLoadingMoreMessages={false}
                    onLoadMore={async () => {}}
                    pendingCount={0}
                    rawMessagesCount={12}
                    normalizedMessagesCount={12}
                    messagesVersion={2}
                    forceScrollToken={0}
                    density="comfortable"
                />
            </I18nProvider>
        )

        Object.defineProperty(viewport, 'scrollHeight', {
            configurable: true,
            writable: true,
            value: 900
        })

        view.rerender(
            <I18nProvider>
                <HappyThread
                    api={{} as never}
                    sessionId="session-1"
                    metadata={null}
                    agentState={null}
                    permissionMode="default"
                    disabled={false}
                    onRefresh={() => {}}
                    onRetryMessage={() => {}}
                    onFlushPending={() => {}}
                    onAtBottomChange={() => {}}
                    isLoadingMessages={false}
                    messagesWarning={null}
                    hasMoreMessages={false}
                    isLoadingMoreMessages={false}
                    onLoadMore={async () => {}}
                    pendingCount={0}
                    rawMessagesCount={18}
                    normalizedMessagesCount={18}
                    messagesVersion={3}
                    forceScrollToken={0}
                    density="comfortable"
                />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(viewport.scrollTop).toBe(900)
        })
    })
})
