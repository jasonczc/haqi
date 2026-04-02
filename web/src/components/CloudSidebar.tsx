import { useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { QuickSpawnDialog } from '@/components/QuickSpawnDialog'

type NavItem = {
    label: string
    path: string
    icon: React.ReactNode
    countKey?: string
}

function ServerIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
    )
}

function BoxIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    )
}

function CameraIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
        </svg>
    )
}

function KeyIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
    )
}

function ListIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
    )
}

function FolderIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    )
}

function AutomationsIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 8v8" />
            <path d="M8 12h8" />
        </svg>
    )
}

function DashboardIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    )
}

const NAV_ITEMS: NavItem[] = [
    { label: 'Dashboard', path: '/cloud/dashboard', icon: <DashboardIcon /> },
    { label: 'Automations', path: '/cloud/automations', icon: <AutomationsIcon /> },
    { label: 'Workers', path: '/cloud/workers', icon: <ServerIcon />, countKey: 'workers' },
    { label: 'Containers', path: '/cloud/containers', icon: <BoxIcon />, countKey: 'containers' },
    { label: 'Checkpoints', path: '/cloud/checkpoints', icon: <CameraIcon />, countKey: 'checkpoints' },
    { label: 'Secrets', path: '/cloud/secrets', icon: <KeyIcon />, countKey: 'secrets' },
    { label: 'Requests', path: '/cloud/requests', icon: <ListIcon />, countKey: 'requests' },
    { label: 'Workspaces', path: '/cloud/workspaces', icon: <FolderIcon />, countKey: 'workspaces' },
]

function useCounts() {
    const { api } = useAppContext()

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        },
    })

    const checkpointsQuery = useQuery({
        queryKey: queryKeys.cloudCheckpoints,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudCheckpoints()
        },
    })

    const secretsQuery = useQuery({
        queryKey: queryKeys.cloudSecrets,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudSecrets()
        },
    })

    const requestsQuery = useQuery({
        queryKey: queryKeys.cloudRequests,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudRequests()
        },
    })

    const workspacesQuery = useQuery({
        queryKey: queryKeys.cloudWorkspaces,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkspaces()
        },
    })

    const containersQuery = useQuery({
        queryKey: ['cloud-containers'],
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudContainers()
        },
    })

    return {
        workers: workersQuery.data?.workers?.length,
        containers: containersQuery.data?.machines
            ? (containersQuery.data.machines as Array<{ containers: unknown[] }>).reduce((acc: number, m: { containers: unknown[] }) => acc + m.containers.length, 0)
            : undefined,
        checkpoints: checkpointsQuery.data?.checkpoints?.length,
        secrets: secretsQuery.data?.secrets?.length,
        requests: requestsQuery.data?.requests?.length,
        workspaces: workspacesQuery.data?.workspaces?.length,
    } as Record<string, number | undefined>
}

export function CloudSidebar() {
    const pathname = useLocation({ select: location => location.pathname })
    const navigate = useNavigate()
    const counts = useCounts()
    const [quickSpawnOpen, setQuickSpawnOpen] = useState(false)

    const showOnboardBanner =
        counts.workers === 0 &&
        typeof localStorage !== 'undefined' &&
        !localStorage.getItem('haqi-onboard-complete')

    return (
        <div className="flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--border-tertiary)] bg-[var(--bg-chrome)]">
            {showOnboardBanner ? (
                <Link
                    to="/cloud/onboard"
                    className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-[var(--border-tertiary)] bg-[var(--bg-accent-secondary)] px-3 py-2 text-xs text-[var(--accent)] hover:opacity-80"
                >
                    <span className="flex-1">Get started → Set up your first cloud agent</span>
                </Link>
            ) : null}
            <div className="flex-1 overflow-y-auto py-2">
                <nav className="flex flex-col gap-0.5 px-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.path || pathname.startsWith(item.path + '/')
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[var(--font-size-base)] transition-colors ${
                                    isActive
                                        ? 'bg-[var(--bg-tertiary)] font-[var(--font-weight-semibold)] text-[var(--text-primary)]'
                                        : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-quaternary)] hover:text-[var(--text-primary)]'
                                }`}
                            >
                                <span className="shrink-0">{item.icon}</span>
                                <span className="flex-1">{item.label}</span>
                                {item.countKey && counts[item.countKey] != null ? (
                                    <span className="text-[var(--font-size-xs)] text-[var(--text-quaternary)]">
                                        {counts[item.countKey]}
                                    </span>
                                ) : null}
                            </Link>
                        )
                    })}
                </nav>
            </div>
            <div className="border-t border-[var(--border-tertiary)] px-3 py-3 flex flex-col gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => navigate({ to: '/cloud/workers' })}
                >
                    + Add Worker
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setQuickSpawnOpen(true)}
                >
                    + New Session
                </Button>
            </div>
            <QuickSpawnDialog
                open={quickSpawnOpen}
                onClose={() => setQuickSpawnOpen(false)}
                onSpawned={(sessionId) => {
                    setQuickSpawnOpen(false)
                    void navigate({ to: '/sessions/$sessionId', params: { sessionId } })
                }}
            />
        </div>
    )
}
