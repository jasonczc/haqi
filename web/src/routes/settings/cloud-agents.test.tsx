import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AppContextProvider } from '@/lib/app-context'
import { I18nProvider } from '@/lib/i18n-context'
import type { ApiClient } from '@/api/client'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'
import SettingsCloudAgentsPage from './cloud-agents'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    Link: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => <a {...props}>{children}</a>,
    useNavigate: () => navigateMock,
}))

vi.mock('@/hooks/queries/useCloudEnvironments', () => ({
    useCloudEnvironments: vi.fn()
}))

vi.mock('@/routes/settings/cloud-workers', () => ({
    default: function MockCloudWorkersManager() {
        return <div>Workers manager</div>
    }
}))

vi.mock('@/routes/settings/cloud-secrets', () => ({
    default: function MockCloudSecretsManager() {
        return <div>Secrets manager</div>
    }
}))

const mockedUseCloudEnvironments = useCloudEnvironments as unknown as ReturnType<typeof vi.fn>

function renderWithProviders(api: ApiClient, props?: { selectedRequestId?: string; selectedWorkspaceId?: string }) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: Number.POSITIVE_INFINITY
            }
        }
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <AppContextProvider value={{ api, token: 'token', baseUrl: 'http://localhost' }}>
                    <SettingsCloudAgentsPage {...props} />
                </AppContextProvider>
            </I18nProvider>
        </QueryClientProvider>
    )
}

describe('SettingsCloudAgentsPage', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        mockedUseCloudEnvironments.mockReturnValue({
            environments: [
                {
                    id: 'repo:https://github.com/acme/demo.git',
                    runtimeKind: 'daemon-session',
                    serviceCount: 1,
                    repositoryDependenciesCount: 2,
                    hasPreviewPorts: true,
                }
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
    })

    afterEach(() => {
        cleanup()
    })

    it('launches a background daemon agent from the dashboard', async () => {
        const spawnSession = vi.fn(async () => ({
            type: 'accepted' as const,
            requestId: 'request-1',
            phase: 'pending' as const
        }))

        const api = {
            getCloudWorkers: vi.fn(async () => ({ workers: [] })),
            getCloudRequests: vi.fn(async () => ({ requests: [] })),
            getCloudWorkspaces: vi.fn(async () => ({ workspaces: [] })),
            getCloudCheckpoints: vi.fn(async () => ({ checkpoints: [] })),
            getCloudAgentSettings: vi.fn(async () => ({
                settings: {
                    gitName: 'Jane Doe',
                    gitEmail: 'jane@example.com',
                    githubUsername: 'octocat',
                    branchPrefix: 'haqi/',
                    baseBranch: 'main',
                    defaultRepositoryUrl: 'https://github.com/acme/demo.git'
                },
                github: {
                    connected: true,
                    profile: {
                        login: 'octocat',
                        name: 'The Octocat',
                        avatarUrl: null
                    },
                    envName: 'GITHUB_TOKEN'
                }
            })),
            getCloudAgentGitHubRepos: vi.fn(async () => ({
                repos: [{
                    fullName: 'acme/demo',
                    name: 'demo',
                    owner: 'acme',
                    private: true,
                    url: 'https://github.com/acme/demo',
                    cloneUrl: 'https://github.com/acme/demo.git',
                    defaultBranch: 'main',
                    updatedAt: '2026-04-15T00:00:00Z'
                }]
            })),
            updateCloudAgentSettings: vi.fn(),
            connectGitHubForCloudAgents: vi.fn(),
            disconnectGitHubForCloudAgents: vi.fn(),
            spawnSession
        } as unknown as ApiClient

        renderWithProviders(api)

        await screen.findByText('Connected as octocat')
        fireEvent.click(screen.getAllByRole('button', { name: 'New Agent' })[0]!)

        fireEvent.change(screen.getByLabelText('Prompt'), {
            target: { value: 'Fix the failing tests and open a branch' }
        })
        fireEvent.click(screen.getAllByRole('button', { name: 'Start Agent' }).at(-1)!)

        await waitFor(() => {
            expect(spawnSession).toHaveBeenCalledTimes(1)
        })

        expect(spawnSession).toHaveBeenCalledWith('auto', expect.objectContaining({
            agent: 'cursor',
            executionBackend: 'cloud-self-hosted',
            runtimeKind: 'daemon-session',
            launchMode: 'background',
            repoSyncPolicy: 'fetch-reset',
            initialPrompt: 'Fix the failing tests and open a branch',
            workspaceSource: {
                type: 'repo',
                repository: {
                    url: 'https://github.com/acme/demo.git',
                    ref: { branch: 'main' },
                    branchStrategy: {
                        mode: 'create',
                        baseBranch: 'main',
                        prefix: 'haqi/'
                    }
                }
            },
            gitIdentity: {
                name: 'Jane Doe',
                email: 'jane@example.com',
                githubUsername: 'octocat'
            }
        }))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/settings/cloud-agents/requests/$requestId',
                params: { requestId: 'request-1' }
            })
        })
    })

    it('renders request detail in-place for agents route detail state', async () => {
        const api = {
            getCloudWorkers: vi.fn(async () => ({ workers: [] })),
            getCloudRequests: vi.fn(async () => ({ requests: [] })),
            getCloudWorkspaces: vi.fn(async () => ({ workspaces: [] })),
            getCloudCheckpoints: vi.fn(async () => ({ checkpoints: [] })),
            getCloudAgentSettings: vi.fn(async () => ({
                settings: {
                    gitName: '',
                    gitEmail: '',
                    githubUsername: '',
                    branchPrefix: 'haqi/',
                    baseBranch: '',
                    defaultRepositoryUrl: ''
                },
                github: {
                    connected: false,
                    profile: null,
                    envName: null
                }
            })),
            getCloudRequest: vi.fn(async () => ({
                request: {
                    id: 'request-42',
                    phase: 'failed',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    request: {
                        workspaceSource: {
                            type: 'repo',
                            repository: {
                                url: 'https://github.com/acme/demo.git',
                                ref: { branch: 'main' }
                            }
                        },
                        environmentId: 'repo:https://github.com/acme/demo.git',
                        launchMode: 'background',
                    },
                    error: {
                        code: 'spawn_failed',
                        message: 'Bootstrap failed'
                    }
                }
            })),
            updateCloudAgentSettings: vi.fn(),
            connectGitHubForCloudAgents: vi.fn(),
            disconnectGitHubForCloudAgents: vi.fn(),
            cancelCloudRequest: vi.fn(),
            retryCloudRequest: vi.fn(),
            getCloudRequestLogs: vi.fn(async () => ({ logs: [], path: '/tmp/log', exists: true }))
        } as unknown as ApiClient

        renderWithProviders(api, { selectedRequestId: 'request-42' })

        expect(await screen.findByText('Request detail')).toBeInTheDocument()
        expect(await screen.findByText('request-42')).toBeInTheDocument()
        expect(screen.getByText('Bootstrap failed')).toBeInTheDocument()
    })
})
