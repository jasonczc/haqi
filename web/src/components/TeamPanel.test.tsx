import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TeamPanel } from './TeamPanel'

const runningAgents = [
    { name: 'test-appserver', task: 'Write converter tests', startedAt: 1 },
    { name: 'test-launcher', task: 'Write lifecycle tests', startedAt: 2 }
]

describe('TeamPanel', () => {
    it('renders running agents even without team state', () => {
        const html = renderToStaticMarkup(
            <TeamPanel agentState={{ runningAgents, runningAgent: runningAgents[1] }} />
        )

        expect(html).toContain('Running Agents')
        expect(html).toContain('2 running')
    })
})
