import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'
import CloudWorkersManager from '@/routes/settings/cloud-workers'
import CloudSecretsManager from '@/routes/settings/cloud-secrets'
import {
    CursorButton,
    CursorEmptyState,
    CursorExpandableRow,
    CursorLinkButton,
    CursorSelectButton,
    CursorSettingsBadge,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
    CursorTextField,
    CursorToggle,
} from '@/components/settings/CursorSettingsPrimitives'

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
    const activeWorkers = workers.filter((worker) => worker.active)
    const defaultEnvironment = environments[0]
    const defaultRepo = useMemo(() => {
        return defaultEnvironment?.id?.replace(/^repo:/, '') ?? 'Select repository'
    }, [defaultEnvironment])

    return (
        <>
            <CursorSettingsHeader
                title="Cloud Agents"
                description="Create agents to edit and run code asynchronously with Cursor-identical settings controls."
            />

            <CursorSettingsSection
                title="Environments"
                subtitle="Cloud agents write better code if their development environment is configured."
                action={<CursorLinkButton to="/settings/onboard" size="sm">Add Environment</CursorLinkButton>}
            >
                <CursorSettingsCard>
                    {environmentsLoading ? (
                        <CursorSettingsRow description="Loading environments…" noBorder />
                    ) : environments.length === 0 ? (
                        <CursorEmptyState
                            className="rounded-none border-0 shadow-none"
                            title="No environments"
                            description="Add a repository environment to preconfigure base images, repo dependencies, and preview ports."
                        />
                    ) : (
                        environments.map((environment) => (
                            <CursorExpandableRow
                                key={environment.id}
                                title={environment.id.replace(/^repo:/, '')}
                                description={environment.runtimeKind === 'host-process' ? 'Host process environment' : 'Daemon session environment'}
                            >
                                <div className="flex flex-col gap-3">
                                    <div className="text-[12px] leading-4 text-[var(--text-secondary)]">Configured Runtime</div>
                                    <CursorTextField readOnly mono value={environment.runtimeKind ?? 'daemon-session'} />
                                    <div className="flex gap-2">
                                        <CursorButton variant="outline" size="sm" type="button">Edit</CursorButton>
                                        <CursorButton variant="danger" size="sm" type="button">Remove</CursorButton>
                                    </div>
                                </div>
                            </CursorExpandableRow>
                        ))
                    )}
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection
                title="Self-Hosted Agents"
                subtitle="Monitor and manage your self-hosted cloud agent workers."
            >
                <CursorSettingsCard className="mb-4">
                    <CursorSettingsRow
                        title="Allow self-hosted agents"
                        description="Enable routing cloud agents through workers connected from your own machines."
                        control={<CursorToggle checked={selfHostedEnabled} onCheckedChange={setSelfHostedEnabled} />}
                        noBorder
                    />
                </CursorSettingsCard>

                <CursorSettingsSection
                    title="My Workers"
                    action={
                        <CursorButton
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => {
                                void workersQuery.refetch()
                                void secretsQuery.refetch()
                            }}
                        >
                            Refresh
                        </CursorButton>
                    }
                    className="mb-0"
                >
                    {workers.length === 0 ? (
                        <CursorEmptyState
                            title="No Workers"
                            description="Connect a self-hosted worker from your machine to run cloud agents on your own hardware."
                            action={<CursorLinkButton to="/settings/onboard" size="sm">Connect Worker</CursorLinkButton>}
                        />
                    ) : (
                        <CursorSettingsCard>
                            {workers.map((worker) => (
                                <CursorSettingsRow
                                    key={worker.machineId}
                                    title={
                                        <>
                                            {worker.machineId}
                                            {worker.active ? <CursorSettingsBadge tone="success">Active</CursorSettingsBadge> : null}
                                        </>
                                    }
                                    description={`${worker.provider} · ${worker.lifecycle ?? 'ready'} · ${worker.region ?? 'unknown region'}`}
                                    control={<span className="text-[13px] leading-[18px] text-[var(--text-secondary)]">{worker.activeRequestsCount ?? 0} active requests</span>}
                                />
                            ))}
                        </CursorSettingsCard>
                    )}
                </CursorSettingsSection>
            </CursorSettingsSection>

            <div className="my-8 border-t border-[var(--border-tertiary)]" />

            <CursorSettingsSection title="Defaults">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Default Model"
                        description="Used when no model is specified."
                        control={<CursorSelectButton type="button">Select model</CursorSelectButton>}
                    />
                    <CursorSettingsRow
                        title="Default Repository"
                        description="Used when no repository is specified."
                        control={<CursorSelectButton type="button">{defaultRepo}</CursorSelectButton>}
                    />
                    <CursorSettingsRow
                        title="Base Branch"
                        description="When empty, Cloud Agent uses the repository default branch."
                        control={<CursorTextField defaultValue="" placeholder="main" />}
                    />
                    <CursorSettingsRow
                        title="Branch Prefix"
                        description="Prefix for branches created by Cloud Agent."
                        control={<CursorTextField defaultValue="cursor/" placeholder="cursor/" />}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Pull Requests">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Create PRs"
                        description="Automatically create a pull request when Cloud Agent completes."
                        control={<CursorSelectButton type="button">Ask every time</CursorSelectButton>}
                    />
                    <CursorSettingsRow
                        title="Review destination"
                        description="Where review artifacts and summaries should go."
                        control={<CursorSelectButton type="button">GitHub PR</CursorSelectButton>}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Notifications">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Slack notifications"
                        description="Post cloud agent progress updates to Slack when connected."
                        control={<CursorToggle checked={false} onCheckedChange={() => undefined} disabled />}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Repository Routing">
                <CursorEmptyState
                    title="No routing rules"
                    description="Add repo-specific rules to select workers, defaults, or security profiles automatically."
                    action={<CursorButton type="button" size="sm">Add Rule</CursorButton>}
                />
            </CursorSettingsSection>

            <CursorSettingsSection title="Security">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Network access"
                        description="Control outbound network access for cloud sessions."
                        control={<CursorSelectButton type="button">Workspace default</CursorSelectButton>}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="User API Keys">
                <CursorEmptyState
                    title="No API keys"
                    description="Bring your own provider credentials for future cloud agent routing and model overrides."
                    action={<CursorButton type="button" size="sm">New API Key</CursorButton>}
                />
            </CursorSettingsSection>

            <CursorSettingsSection
                title="Worker Management"
                subtitle="Full enrollment, token, and worker lifecycle controls in the new settings UI."
            >
                <CursorSettingsCard className="p-0">
                    <CloudWorkersManager />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection
                title="Secret Management"
                subtitle="Full secret CRUD and enrollment token management without leaving Cloud Agents."
            >
                <CursorSettingsCard className="p-0">
                    <CloudSecretsManager />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <div className="mt-4 text-[12px] leading-4 text-[var(--text-secondary)]">
                Active workers: {activeWorkers.length} of {workers.length}
            </div>
        </>
    )
}
