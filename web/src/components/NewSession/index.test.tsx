import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/lib/i18n-context'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { NewSession } from './index'
import { useCloudProviders } from '@/hooks/queries/useCloudProviders'
import { useCloudWorkers } from '@/hooks/queries/useCloudWorkers'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'

vi.mock('@/hooks/queries/useCloudProviders', () => ({
    useCloudProviders: vi.fn()
}))

vi.mock('@/hooks/queries/useCloudWorkers', () => ({
    useCloudWorkers: vi.fn()
}))

vi.mock('@/hooks/queries/useCloudEnvironments', () => ({
    useCloudEnvironments: vi.fn()
}))

const mockedUseCloudProviders = vi.mocked(useCloudProviders)
const mockedUseCloudWorkers = vi.mocked(useCloudWorkers)
const mockedUseCloudEnvironments = vi.mocked(useCloudEnvironments)

function renderWithProviders(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false
            }
        }
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                {ui}
            </I18nProvider>
        </QueryClientProvider>
    )
}

describe('NewSession initial directory preset', () => {
    afterEach(() => {
        cleanup()
        localStorage.clear()
    })

    beforeEach(() => {
        localStorage.clear()
        localStorage.setItem('hapi-lang', 'en')
        localStorage.setItem('hapi:lastMachineId', 'machine-1')
        localStorage.setItem('hapi:recentPaths', JSON.stringify({
            'machine-1': ['/recent/path']
        }))
        mockedUseCloudProviders.mockReturnValue({
            providers: [],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mockedUseCloudWorkers.mockReturnValue({
            workers: [],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mockedUseCloudEnvironments.mockReturnValue({
            environments: [],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
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
    })

    it('keeps initialDirectory instead of overriding with recent path', async () => {
        const getSessions = vi.fn(async () => ({ sessions: [] }))
        const checkMachinePathsExists = vi.fn(async (_machineId: string, paths: string[]) => ({
            exists: Object.fromEntries(paths.map((path) => [path, true]))
        }))

        const api = {
            getSessions,
            checkMachinePathsExists,
            spawnSession: vi.fn()
        } as unknown as ApiClient

        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadata: {
                    host: 'devbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi'
                },
                metadataVersion: 1,
                runnerState: null,
                runnerStateVersion: 1
            }
        ]

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                initialDirectory="/preset/project"
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        await waitFor(() => {
            expect(checkMachinePathsExists).toHaveBeenCalled()
        })

        expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('/preset/project')
    })

    it('creates session on command + enter', async () => {
        const getSessions = vi.fn(async () => ({ sessions: [] }))
        const checkMachinePathsExists = vi.fn(async (_machineId: string, paths: string[]) => ({
            exists: Object.fromEntries(paths.map((path) => [path, true]))
        }))
        const spawnSession = vi.fn(async (machineId: string, directory: string) => ({
            type: 'success',
            sessionId: 'session-1' as const,
            machineId,
            directory
        }))
        const onSuccess = vi.fn()

        const api = {
            getSessions,
            checkMachinePathsExists,
            spawnSession
        } as unknown as ApiClient

        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadata: {
                    host: 'devbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi'
                },
                metadataVersion: 1,
                runnerState: null,
                runnerStateVersion: 1
            }
        ]

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                onSuccess={onSuccess}
                onCancel={vi.fn()}
            />
        )

        const directoryInput = screen.getByPlaceholderText('/path/to/project')
        fireEvent.change(directoryInput, { target: { value: '/tmp/project' } })
        fireEvent.keyDown(directoryInput, { key: 'Enter', metaKey: true })

        await waitFor(() => {
            expect(spawnSession).toHaveBeenCalledTimes(1)
        })

        const [calledMachineId, calledRequest] = spawnSession.mock.calls[0]
        expect(calledMachineId).toBe('machine-1')
        expect(calledRequest).toEqual(expect.objectContaining({
            directory: '/tmp/project'
        }))
        expect(onSuccess).toHaveBeenCalledWith('session-1')
    })

    it('stores last successful config and restores it on next create form open', async () => {
        const getSessions = vi.fn(async () => ({ sessions: [] }))
        const checkMachinePathsExists = vi.fn(async (_machineId: string, paths: string[]) => ({
            exists: Object.fromEntries(paths.map((path) => [path, true]))
        }))
        const spawnSession = vi.fn(async (machineId: string, directory: string) => ({
            type: 'success',
            sessionId: 'session-2' as const,
            machineId,
            directory
        }))

        const api = {
            getSessions,
            checkMachinePathsExists,
            spawnSession
        } as unknown as ApiClient

        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadata: {
                    host: 'devbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi'
                },
                metadataVersion: 1,
                runnerState: null,
                runnerStateVersion: 1
            }
        ]

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        fireEvent.change(screen.getByPlaceholderText('/path/to/project'), { target: { value: '/tmp/project' } })
        fireEvent.click(screen.getByRole('radio', { name: 'codex' }))
        fireEvent.change(screen.getByPlaceholderText('http://localhost:3000'), { target: { value: 'http://localhost:4173' } })
        fireEvent.keyDown(screen.getByPlaceholderText('/path/to/project'), { key: 'Enter', metaKey: true })

        await waitFor(() => {
            expect(spawnSession).toHaveBeenCalledTimes(1)
        })

        const savedRaw = localStorage.getItem('hapi:newSession:lastConfig')
        expect(savedRaw).not.toBeNull()
        const saved = JSON.parse(savedRaw ?? '{}')
        expect(saved.agent).toBe('codex')
        expect(saved.previewUrl).toBe('http://localhost:4173/')

        cleanup()

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        expect(screen.getByRole('radio', { name: 'codex' })).toBeChecked()
        expect(screen.getByPlaceholderText('http://localhost:3000')).toHaveValue('http://localhost:4173/')
    })

    it('submits cloud runtime settings and persists them', async () => {
        const getSessions = vi.fn(async () => ({ sessions: [] }))
        const checkMachinePathsExists = vi.fn(async (_machineId: string, paths: string[]) => ({
            exists: Object.fromEntries(paths.map((path) => [path, true]))
        }))
        const spawnSession = vi.fn(async (_machineId: string, request: unknown) => ({
            type: 'success',
            sessionId: 'session-cloud' as const,
            request
        }))

        const api = {
            getSessions,
            checkMachinePathsExists,
            spawnSession
        } as unknown as ApiClient

        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadata: {
                    host: 'cloudbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi',
                    executorType: 'cloud-self-hosted',
                    capabilities: {
                        docker: true,
                        serviceContainers: true,
                        dockerSession: true
                    }
                },
                metadataVersion: 1,
                runnerState: null,
                runnerStateVersion: 1
            }
        ]

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('radio', { name: 'Self-hosted cloud worker' }))
        fireEvent.change(screen.getByPlaceholderText('/path/to/project'), { target: { value: '/tmp/project' } })
        fireEvent.click(screen.getByRole('radio', { name: 'Docker session' }))
        fireEvent.change(screen.getByPlaceholderText('default-node18'), { target: { value: 'node-dev' } })
        fireEvent.change(screen.getByPlaceholderText('https://github.com/org/repo.git'), { target: { value: 'https://github.com/acme/demo.git' } })
        fireEvent.change(screen.getByPlaceholderText('main'), { target: { value: 'feature/cloud' } })
        fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'persistent' } })
        fireEvent.change(screen.getByPlaceholderText('120'), { target: { value: '120' } })
        fireEvent.keyDown(screen.getByPlaceholderText('/path/to/project'), { key: 'Enter', metaKey: true })

        await waitFor(() => {
            expect(spawnSession).toHaveBeenCalledTimes(1)
        })

        const [, request] = spawnSession.mock.calls[0]
        expect(request).toEqual(expect.objectContaining({
            directory: '/tmp/project',
            runtimeKind: 'docker-session',
            environmentId: 'node-dev',
            workspaceSource: expect.objectContaining({
                type: 'repo',
                repository: expect.objectContaining({
                    url: 'https://github.com/acme/demo.git',
                    ref: expect.objectContaining({ branch: 'feature/cloud' })
                })
            }),
            workspace: expect.objectContaining({
                mode: 'persistent'
            }),
            ttlMinutes: 120,
        }))

        const savedRaw = localStorage.getItem('hapi:newSession:lastConfig')
        expect(savedRaw).not.toBeNull()
        const saved = JSON.parse(savedRaw ?? '{}')
        expect(saved.runtimeKind).toBe('docker-session')
        expect(saved.environmentId).toBe('node-dev')
        expect(saved.repositoryUrl).toBe('https://github.com/acme/demo.git')
        expect(saved.repositoryBranch).toBe('feature/cloud')
        expect(saved.workspaceMode).toBe('persistent')
        expect(saved.ttlMinutes).toBe('120')
    })

    it('renders translated cloud settings labels', async () => {
        const getSessions = vi.fn(async () => ({ sessions: [] }))
        const checkMachinePathsExists = vi.fn(async (_machineId: string, paths: string[]) => ({
            exists: Object.fromEntries(paths.map((path) => [path, true]))
        }))

        const api = {
            getSessions,
            checkMachinePathsExists,
            spawnSession: vi.fn()
        } as unknown as ApiClient

        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadata: {
                    host: 'cloudbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi'
                },
                metadataVersion: 1,
                runnerState: null,
                runnerStateVersion: 1
            }
        ]

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('radio', { name: 'Self-hosted cloud worker' }))

        expect(screen.getByText('Execution backend')).toBeInTheDocument()
        expect(screen.getByText('Runtime')).toBeInTheDocument()
        expect(screen.getByLabelText('Environment ID')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('default-node18')).toBeInTheDocument()
        expect(screen.getByLabelText('Repository URL')).toBeInTheDocument()
        expect(screen.getByLabelText('Branch')).toBeInTheDocument()
        expect(screen.getByLabelText('TTL minutes')).toBeInTheDocument()
    })

    it('renders cloud inventory summary and docker capability warnings', async () => {
        mockedUseCloudProviders.mockReturnValue({
            providers: [
                { id: 'auto', type: 'self-hosted', count: 2 },
                { id: 'docker', type: 'self-hosted', count: 1 }
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mockedUseCloudWorkers.mockReturnValue({
            workers: [
                {
                    machineId: 'machine-1',
                    provider: 'docker',
                    active: true,
                    executorType: 'cloud-self-hosted',
                    capabilities: {
                        docker: true,
                        dockerSession: false
                    },
                    updatedAt: Date.now()
                }
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })

        const api = {
            getSessions: vi.fn(async () => ({ sessions: [] })),
            checkMachinePathsExists: vi.fn(async (_machineId: string, paths: string[]) => ({
                exists: Object.fromEntries(paths.map((path) => [path, true]))
            })),
            spawnSession: vi.fn()
        } as unknown as ApiClient

        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadata: {
                    host: 'cloudbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi'
                },
                metadataVersion: 1,
                runnerState: null,
                runnerStateVersion: 1
            }
        ]

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('radio', { name: 'Self-hosted cloud worker' }))

        expect(screen.getByText('Cloud inventory')).toBeInTheDocument()
        expect(screen.getByText('1 providers available')).toBeInTheDocument()
        expect(screen.getByText('1 workers visible')).toBeInTheDocument()
        expect(screen.getByText('self-hosted')).toBeInTheDocument()
        expect(screen.queryByText('No selected cloud workers advertise Docker support.')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('radio', { name: 'Docker session' }))

        expect(screen.getByText('No selected cloud workers advertise full docker-session support.')).toBeInTheDocument()
    })

    it('renders suggested cloud environments and lets users apply one', async () => {
        mockedUseCloudProviders.mockReturnValue({
            providers: [{ id: 'auto', type: 'self-hosted', count: 1 }],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mockedUseCloudWorkers.mockReturnValue({
            workers: [
                {
                    machineId: 'machine-1',
                    provider: 'docker',
                    active: true,
                    executorType: 'cloud-self-hosted',
                    capabilities: { docker: true, dockerSession: true },
                    updatedAt: Date.now()
                }
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mockedUseCloudEnvironments.mockReturnValue({
            environments: [
                {
                    id: 'node-dev',
                    source: 'team',
                    runtimeKind: 'docker-session',
                    serviceCount: 2,
                    repositoryDependenciesCount: 1,
                    hasPreviewPorts: true
                },
                {
                    id: 'py-dev',
                    source: 'user',
                    runtimeKind: 'host-process',
                    serviceCount: 0,
                    repositoryDependenciesCount: 0,
                    hasPreviewPorts: false
                }
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })

        const api = {
            getSessions: vi.fn(async () => ({ sessions: [] })),
            checkMachinePathsExists: vi.fn(async (_machineId: string, paths: string[]) => ({
                exists: Object.fromEntries(paths.map((path) => [path, true]))
            })),
            spawnSession: vi.fn()
        } as unknown as ApiClient

        const machines: Machine[] = [
            {
                id: 'machine-1',
                seq: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                active: true,
                activeAt: Date.now(),
                metadata: {
                    host: 'cloudbox',
                    platform: 'linux',
                    happyCliVersion: '0.15.2',
                    homeDir: '/home/test',
                    happyHomeDir: '/home/test/.hapi',
                    happyLibDir: '/opt/haqi'
                },
                metadataVersion: 1,
                runnerState: null,
                runnerStateVersion: 1
            }
        ]

        renderWithProviders(
            <NewSession
                api={api}
                machines={machines}
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('radio', { name: 'Self-hosted cloud worker' }))

        expect(screen.getByText('node-dev')).toBeInTheDocument()
        fireEvent.change(screen.getByPlaceholderText('default-node18'), { target: { value: 'node-dev' } })

        expect(screen.getByDisplayValue('node-dev')).toBeInTheDocument()
    })
})
