import { afterEach, describe, expect, it } from 'bun:test'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'
import { SyncEngine } from './syncEngine'

type Harness = {
    store: Store
    engine: SyncEngine
    sseManager: SSEManager
}

const harnesses: Harness[] = []

function createHarness(): Harness {
    const store = new Store(':memory:')
    const sseManager = new SSEManager(0, new VisibilityTracker())
    const engine = new SyncEngine(
        store,
        {} as Server,
        new RpcRegistry(),
        sseManager
    )
    return { store, engine, sseManager }
}

afterEach(() => {
    while (harnesses.length > 0) {
        const harness = harnesses.pop()
        if (!harness) {
            continue
        }
        harness.engine.stop()
        harness.sseManager.stop()
    }
})

describe('SyncEngine swarm automation locking', () => {
    it('serializes lease-expiry reassignment for the same swarm', async () => {
        const harness = createHarness()
        harnesses.push(harness)

        const sessionA = harness.engine.getOrCreateSession(
            'session-a',
            { path: '/repo/a', host: 'dev', flavor: 'claude' },
            null,
            'default'
        )
        const sessionB = harness.engine.getOrCreateSession(
            'session-b',
            { path: '/repo/b', host: 'dev', flavor: 'claude' },
            null,
            'default'
        )

        const swarm = harness.store.swarms.createSwarm({
            namespace: 'default',
            title: 'Lease Reassign Test',
            subject: {
                summary: 'Reassign expired work item'
            }
        })
        harness.store.swarms.addSwarmPolicy({
            swarmId: swarm.id,
            namespace: 'default',
            kind: 'autonomy',
            status: 'active',
            config: {
                auto: true,
                maxAutoReassignments: 3,
                stopOnDeliver: true
            }
        })
        harness.store.swarms.addSwarmRoleProfile({
            swarmId: swarm.id,
            namespace: 'default',
            role: 'implementer',
            instructionText: 'Implement assigned work.',
            preferredSkillIds: ['implement-change'],
            allowedTools: ['edit_file', 'run_tests'],
            outputContract: 'artifact plus summary'
        })

        const participantA = harness.store.swarms.addSwarmParticipant({
            swarmId: swarm.id,
            namespace: 'default',
            kind: 'agent',
            refId: sessionA.id,
            availability: 'active',
            capabilities: ['coding']
        })
        const participantB = harness.store.swarms.addSwarmParticipant({
            swarmId: swarm.id,
            namespace: 'default',
            kind: 'agent',
            refId: sessionB.id,
            availability: 'active',
            capabilities: ['coding']
        })
        const workItem = harness.store.swarms.addSwarmWorkItem({
            swarmId: swarm.id,
            namespace: 'default',
            subjectId: harness.store.swarms.getSwarmSubject(swarm.id, 'default')?.id ?? null,
            title: 'Fix worker stall',
            intent: 'Continue implementation after lease expiry',
            status: 'running',
            assignedParticipantId: participantA.id,
            expectedArtifact: 'code-change',
            doneCriteria: 'Artifact recorded'
        })
        harness.store.swarms.addSwarmWorkItemAssignment({
            swarmId: swarm.id,
            namespace: 'default',
            workItemId: workItem.id,
            participantId: participantA.id,
            status: 'active',
            reason: 'initial'
        })
        harness.store.swarms.upsertSwarmParticipantLease({
            swarmId: swarm.id,
            namespace: 'default',
            workItemId: workItem.id,
            participantId: participantA.id,
            status: 'active',
            lastHeartbeatAt: Date.now() - 60_000,
            expiresAt: Date.now() - 1_000
        })

        let sendCount = 0
        ;(harness.engine as unknown as {
            sendMessage: (sessionId: string, payload: unknown) => Promise<void>
            pickBestSwarmParticipantWithSkills: () => Promise<{ id: string; refId: string }>
        }).sendMessage = async () => {
            sendCount += 1
            await new Promise((resolve) => setTimeout(resolve, 15))
        }
        ;(harness.engine as unknown as {
            pickBestSwarmParticipantWithSkills: () => Promise<{ id: string; refId: string }>
        }).pickBestSwarmParticipantWithSkills = async () => ({ id: participantB.id, refId: sessionB.id })

        await Promise.all([
            (harness.engine as unknown as { reassignExpiredSwarmLeases: () => Promise<void> }).reassignExpiredSwarmLeases(),
            (harness.engine as unknown as { reassignExpiredSwarmLeases: () => Promise<void> }).reassignExpiredSwarmLeases()
        ])

        const events = harness.store.swarms.getSwarmEvents(swarm.id, 'default')
        const assignments = harness.store.swarms.getSwarmWorkItemAssignments(swarm.id, 'default')
        const leases = harness.store.swarms.getSwarmParticipantLeases(swarm.id, 'default')
        const updatedWorkItem = harness.store.swarms.getSwarmWorkItemById(swarm.id, 'default', workItem.id)

        expect(events.filter((item) => item.type === 'work-item-reassigned')).toHaveLength(1)
        expect(assignments.filter((item) => item.workItemId === workItem.id && item.status === 'active')).toHaveLength(1)
        expect(assignments.find((item) => item.workItemId === workItem.id && item.status === 'active')?.participantId).toBe(participantB.id)
        expect(leases.find((item) => item.workItemId === workItem.id && item.participantId === participantA.id)?.status).toBe('expired')
        expect(leases.find((item) => item.workItemId === workItem.id && item.participantId === participantB.id)?.status).toBe('active')
        expect(updatedWorkItem?.assignedParticipantId).toBe(participantB.id)
        expect(sendCount).toBe(1)
    })
})
