import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import type { Machine } from '@/types/api'
import { MachineList } from './MachineList'

function renderWithI18n(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

describe('MachineList', () => {
    it('shows cloud worker metadata, lifecycle, capacity, and errors', () => {
        const onSelect = vi.fn()
        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadataVersion: 1,
                runnerStateVersion: 1,
                metadata: {
                    host: 'cloudbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    displayName: 'Cloud Box',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi',
                    executorType: 'cloud-self-hosted',
                    provider: 'docker',
                    region: 'us-west1',
                    environmentId: 'fullstack-node',
                    workerVersion: '2026.03.30',
                    labels: ['cloud', 'docker'],
                    capabilities: {
                        docker: true,
                        dockerSession: true
                    },
                    resources: {
                        cpu: 4,
                        memoryMb: 8192,
                        diskGb: 40
                    }
                },
                runnerState: {
                    lifecycle: 'busy',
                    status: 'running',
                    currentSessionId: 'session-1',
                    capacity: {
                        total: 2,
                        used: 1
                    },
                    workspacePreparation: {
                        phase: 'cloning-repo',
                        repo: 'https://github.com/acme/demo.git',
                        ref: 'feature/cloud',
                        progress: 40,
                        startedAt: Date.now() - 10_000,
                        updatedAt: Date.now()
                    },
                    lastProvisionError: {
                        message: 'docker daemon unavailable',
                        at: Date.now() - 20_000
                    },
                    lastWorkspaceError: {
                        message: 'git fetch failed',
                        at: Date.now() - 15_000
                    },
                    lastSpawnError: {
                        message: 'runner exited unexpectedly',
                        at: Date.now() - 5_000
                    },
                    publicPreviewBaseUrl: 'https://preview.example.com'
                }
            }
        ]

        renderWithI18n(
            <MachineList
                machines={machines}
                onSelect={onSelect}
            />
        )

        expect(screen.getByText('Cloud Box')).toBeInTheDocument()
        expect(screen.getByText('linux · cloud-self-hosted · busy')).toBeInTheDocument()
        expect(screen.getByText('provider: docker')).toBeInTheDocument()
        expect(screen.getByText('region: us-west1')).toBeInTheDocument()
        expect(screen.getByText('env: fullstack-node')).toBeInTheDocument()
        expect(screen.getByText('worker: 2026.03.30')).toBeInTheDocument()
        expect(screen.getByText('labels: cloud, docker')).toBeInTheDocument()
        expect(screen.getByText('capacity: 1/2')).toBeInTheDocument()
        expect(screen.getByText('preview: public')).toBeInTheDocument()
        expect(screen.getByText('workspace: cloning-repo · 40% · https://github.com/acme/demo.git')).toBeInTheDocument()
        expect(screen.getByText('provision: docker daemon unavailable')).toBeInTheDocument()
        expect(screen.getByText('workspace: git fetch failed')).toBeInTheDocument()
        expect(screen.getByText('spawn: runner exited unexpectedly')).toBeInTheDocument()

        fireEvent.click(screen.getByText('Cloud Box'))
        expect(onSelect).toHaveBeenCalledWith('machine-1')
    })
})
