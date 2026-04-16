import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import SettingsLayout from './layout'

vi.mock('@tanstack/react-router', () => ({
    Link: ({ children, to, ...props }: { children?: ReactNode; to: string } & Record<string, unknown>) => <a href={to} {...props}>{children}</a>,
    Outlet: () => <div>Outlet</div>,
    useLocation: ({ select }: { select: (location: { pathname: string }) => string }) => select({ pathname: '/settings/overview' }),
}))

describe('SettingsLayout', () => {
    afterEach(() => {
        cleanup()
    })

    it('links Cloud Agents nav to the standalone route', () => {
        render(<SettingsLayout />)
        const cloudAgentsLink = screen.getByRole('link', { name: /Cloud Agents/i })
        expect(cloudAgentsLink).toHaveAttribute('href', '/settings/cloud-agents')
    })
})
