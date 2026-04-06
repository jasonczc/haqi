import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'
import CloudWorkersManager from '@/routes/settings/cloud-workers'
import CloudSecretsManager from '@/routes/settings/cloud-secrets'

function ChevronIcon(props: { open: boolean }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: props.open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function ExpandableRow(props: { title: string; description: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(Boolean(props.defaultOpen))
    return (
        <div className={`settings-expandable${open ? ' open' : ''}`}>
            <div className="settings-row settings-expandable-header" onClick={() => setOpen((v) => !v)}>
                <div className="settings-row-left">
                    <span className="settings-row-title">{props.title}</span>
                </div>
                <div className="settings-row-right">
                    <span className="settings-row-desc">{props.description}</span>
                    <ChevronIcon open={open} />
                </div>
            </div>
            <div className="settings-expandable-content-wrapper">
                <div className="settings-expandable-content">{props.children}</div>
            </div>
        </div>
    )
}

export default function SettingsCloudAgentsPage() {
    const { api } = useAppContext()
    const { environments, isLoading: environmentsLoading } = useCloudEnvironments(api, true)
    const [selfHostedEnabled, setSelfHostedEnabled] = useState(true)

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        }
    })

    const secretsQuery = useQuery({
        queryKey: queryKeys.cloudSecrets,
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudSecrets()
        }
    })

    const workers = workersQuery.data?.workers ?? []
    const secrets = secretsQuery.data?.secrets ?? []
    const activeWorkers = workers.filter((worker) => worker.active)
    const defaultEnvironment = environments[0]
    const defaultRepo = useMemo(() => {
        return defaultEnvironment?.id?.replace(/^repo:/, '') ?? 'Select repository'
    }, [defaultEnvironment])

    return (
        <>
            <div className="settings-header">
                <h1>Cloud Agents</h1>
                <p>Create Agents to edit and run code asynchronously with Cursor-style settings controls.</p>
            </div>

            <div className="settings-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                    <div>
                        <div className="settings-section-title">Environments</div>
                        <div className="settings-section-subtitle" style={{ marginBottom: 0 }}>Cloud agents write better code if their development environment is configured.</div>
                    </div>
                    <Link className="settings-btn" to="/settings/onboard">Add Environment</Link>
                </div>
                <div className="settings-card">
                    {environmentsLoading ? (
                        <div className="settings-row settings-row-nobottom"><span className="settings-row-desc">Loading environments…</span></div>
                    ) : environments.length === 0 ? (
                        <div className="settings-empty-state" style={{ border: 'none', borderRadius: 0 }}>
                            <div className="settings-empty-title">No environments</div>
                            <div className="settings-empty-desc">Add a repository environment to preconfigure base images, repo dependencies, and preview ports.</div>
                        </div>
                    ) : (
                        environments.map((environment) => (
                            <ExpandableRow
                                key={environment.id}
                                title={environment.id.replace(/^repo:/, '')}
                                description={environment.runtimeKind === 'docker-session' ? 'Personal environment active' : 'Host process environment'}
                                defaultOpen={false}
                            >
                                <div className="settings-section-subtitle" style={{ marginBottom: 12, color: 'var(--cursor-text-primary)' }}>Configured Runtime</div>
                                <input className="settings-input" style={{ width: '100%', minWidth: 0, borderColor: 'transparent', fontFamily: 'var(--cursor-font-family-mono)' }} readOnly value={environment.runtimeKind ?? 'docker-session'} />
                                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                                    <button className="settings-btn-outline" style={{ width: 'auto', padding: '4px 12px' }} type="button">Edit</button>
                                    <button className="settings-btn-outline text-[var(--danger)] border-[var(--danger)]/20 hover:bg-[var(--danger)]/10" style={{ width: 'auto', padding: '4px 12px' }} type="button">Remove</button>
                                </div>
                            </ExpandableRow>
                        ))
                    )}
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Self-Hosted Agents</div>
                <div className="settings-section-subtitle">Monitor and manage your self-hosted cloud agent workers.</div>
                <div className="settings-card" style={{ marginBottom: 16 }}>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Allow self-hosted agents</span>
                            <span className="settings-row-desc">Enable routing cloud agents through workers connected from your own machines.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input type="checkbox" checked={selfHostedEnabled} onChange={() => setSelfHostedEnabled((v) => !v)} />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                    <div className="settings-section-title" style={{ marginBottom: 0 }}>My Workers</div>
                    <button
                        className="settings-btn"
                        style={{ background: 'transparent' }}
                        type="button"
                        onClick={() => {
                            void workersQuery.refetch()
                            void secretsQuery.refetch()
                        }}
                    >
                        Refresh
                    </button>
                </div>
                {workers.length === 0 ? (
                    <div className="settings-empty-state">
                        <div className="settings-empty-title">No Workers</div>
                        <div className="settings-empty-desc">Connect a self-hosted worker from your machine to run cloud agents on your own hardware.</div>
                        <Link className="settings-btn" to="/settings/onboard">Connect Worker</Link>
                    </div>
                ) : (
                    <div className="settings-card">
                        {workers.map((worker) => (
                            <div key={worker.machineId} className="settings-row">
                                <div className="settings-row-left">
                                    <span className="settings-row-title">{worker.machineId} {worker.active ? <span className="settings-badge">Active</span> : null}</span>
                                    <span className="settings-row-desc">{worker.provider} · {worker.lifecycle ?? 'ready'} · {worker.region ?? 'unknown region'}</span>
                                </div>
                                <div className="settings-row-right">
                                    <span className="settings-row-desc">{worker.activeRequestsCount ?? 0} active requests</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="dropdown-divider" style={{ margin: '32px 0' }} />

            <div className="settings-section">
                <div className="settings-section-title">Defaults</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Default Model</span>
                            <span className="settings-row-desc">Used when no model is specified.</span>
                        </div>
                        <div className="settings-row-right"><button className="custom-select-btn" type="button"><span>Select model</span><ChevronIcon open={false} /></button></div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Default Repository</span>
                            <span className="settings-row-desc">Used when no repository is specified.</span>
                        </div>
                        <div className="settings-row-right"><button className="custom-select-btn" type="button"><span>{defaultRepo}</span><ChevronIcon open={false} /></button></div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Base Branch</span>
                            <span className="settings-row-desc">When empty, Cloud Agent uses the repository default branch.</span>
                        </div>
                        <div className="settings-row-right"><input className="settings-input" placeholder="main" defaultValue="" /></div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Branch Prefix</span>
                            <span className="settings-row-desc">Prefix for branches created by Cloud Agent.</span>
                        </div>
                        <div className="settings-row-right"><input className="settings-input" placeholder="cursor/" defaultValue="cursor/" /></div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Pull Requests</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left"><span className="settings-row-title">Create PRs</span><span className="settings-row-desc">Automatically create a pull request when Cloud Agent completes.</span></div>
                        <div className="settings-row-right"><button className="custom-select-btn" type="button"><span>Ask every time</span><ChevronIcon open={false} /></button></div>
                    </div>
                    <div className="settings-row">
                        <div className="settings-row-left"><span className="settings-row-title">Review destination</span><span className="settings-row-desc">Where review artifacts and summaries should go.</span></div>
                        <div className="settings-row-right"><button className="custom-select-btn" type="button"><span>GitHub PR</span><ChevronIcon open={false} /></button></div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Notifications</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left"><span className="settings-row-title">Slack notifications</span><span className="settings-row-desc">Post cloud agent progress updates to Slack when connected.</span></div>
                        <div className="settings-row-right"><label className="settings-toggle"><input type="checkbox" disabled /><span className="settings-toggle-slider" /></label></div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Repository Routing</div>
                <div className="settings-empty-state">
                    <div className="settings-empty-title">No routing rules</div>
                    <div className="settings-empty-desc">Add repo-specific rules to select workers, defaults, or security profiles automatically.</div>
                    <button className="settings-btn" type="button">Add Rule</button>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Security</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left"><span className="settings-row-title">Network access</span><span className="settings-row-desc">Control outbound network access for cloud sessions.</span></div>
                        <div className="settings-row-right"><button className="custom-select-btn" type="button"><span>Workspace default</span><ChevronIcon open={false} /></button></div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">User API Keys</div>
                <div className="settings-empty-state">
                    <div className="settings-empty-title">No API keys</div>
                    <div className="settings-empty-desc">Bring your own provider credentials for future cloud agent routing and model overrides.</div>
                    <button className="banner-btn" type="button">New API Key</button>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Worker Management</div>
                <div className="settings-section-subtitle">Full enrollment, token, and worker lifecycle controls in the new settings UI.</div>
                <div className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <CloudWorkersManager />
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Secret Management</div>
                <div className="settings-section-subtitle">Full secret CRUD and enrollment token management without leaving Cloud Agents.</div>
                <div className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <CloudSecretsManager />
                </div>
            </div>

            <div className="settings-section-subtitle" style={{ marginTop: 16 }}>
                Active workers: {activeWorkers.length} · Environments: {environments.length} · Secrets: {secrets.length}
            </div>
        </>
    )
}
