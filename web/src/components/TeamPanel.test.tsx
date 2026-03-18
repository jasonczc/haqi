import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TeamPanel } from './TeamPanel'

const runningAgents = [
    { name: 'test-appserver', task: 'Write converter tests', startedAt: 1 },
    { name: 'test-launcher', task: 'Write lifecycle tests', startedAt: 2 }
]

afterEach(() => {
    cleanup()
})

describe('TeamPanel', () => {
    function clickTeamToggle(): void {
        const button = screen.getAllByRole('button').find((candidate) => candidate.textContent?.includes('Team: demo-team'))
        if (!button) {
            throw new Error('Missing team toggle button')
        }
        fireEvent.click(button)
    }

    it('renders running agents even without team state', () => {
        const html = renderToStaticMarkup(
            <TeamPanel agentState={{ runningAgents, runningAgent: runningAgents[1] }} />
        )

        expect(html).toContain('Running Agents')
        expect(html).toContain('2 running')
    })

    it('submits teammate control requests from the inline form', async () => {
        const onControl = vi.fn(async () => {})

        render(
            <TeamPanel
                canControl
                onControl={onControl}
                teamState={{
                    teamName: 'demo-team',
                    members: [{ name: 'researcher', status: 'active' }],
                    tasks: [{ id: 'task-1', title: 'Trace auth bug', status: 'pending' }]
                }}
            />
        )

        clickTeamToggle()
        fireEvent.click(screen.getByRole('button', { name: 'Message' }))
        fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please inspect auth.ts' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send to lead' }))

        await waitFor(() => expect(onControl).toHaveBeenCalledTimes(1))
        const firstCall = onControl.mock.calls.at(0)
        if (!firstCall) {
            throw new Error('Expected onControl to be called')
        }
        const [request] = firstCall as unknown as [unknown]
        expect(request).toEqual({
            action: 'message',
            memberName: 'researcher',
            message: 'Please inspect auth.ts'
        })
    })

    it('prefills assign task flow with task and owner selectors', async () => {
        const onControl = vi.fn(async () => {})

        render(
            <TeamPanel
                canControl
                onControl={onControl}
                teamState={{
                    teamName: 'demo-team',
                    members: [
                        { name: 'researcher', status: 'active' },
                        { name: 'reviewer', status: 'idle' }
                    ],
                    tasks: [{ id: 'task-1', title: 'Trace auth bug', owner: 'researcher', status: 'pending' }]
                }}
            />
        )

        clickTeamToggle()
        fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
        fireEvent.change(screen.getByLabelText('Teammate'), { target: { value: 'reviewer' } })
        fireEvent.change(screen.getByLabelText('Additional guidance (optional)'), { target: { value: 'Focus on middleware first.' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send to lead' }))

        await waitFor(() => expect(onControl).toHaveBeenCalledTimes(1))
        const firstCall = onControl.mock.calls.at(0)
        if (!firstCall) {
            throw new Error('Expected onControl to be called')
        }
        const [request] = firstCall as unknown as [unknown]
        expect(request).toEqual({
            action: 'assign_task',
            memberName: 'reviewer',
            taskId: 'task-1',
            message: 'Focus on middleware first.'
        })
    })

    it('requires confirmation before cleanup actions can be sent', async () => {
        const onControl = vi.fn(async () => {})

        render(
            <TeamPanel
                canControl
                onControl={onControl}
                teamState={{
                    teamName: 'demo-team',
                    members: [{ name: 'researcher', status: 'active' }],
                    tasks: []
                }}
            />
        )

        clickTeamToggle()
        fireEvent.click(screen.getByRole('button', { name: 'Clean up team' }))
        fireEvent.click(screen.getByRole('button', { name: 'Send to lead' }))
        expect(onControl).not.toHaveBeenCalled()
        expect(screen.getByText('Confirm this action before sending it to the lead.')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('checkbox'))
        fireEvent.click(screen.getByRole('button', { name: 'Send to lead' }))

        await waitFor(() => expect(onControl).toHaveBeenCalledTimes(1))
        const firstCall = onControl.mock.calls.at(0)
        if (!firstCall) {
            throw new Error('Expected onControl to be called')
        }
        const [request] = firstCall as unknown as [unknown]
        expect(request).toEqual({
            action: 'cleanup_team'
        })
    })
})
