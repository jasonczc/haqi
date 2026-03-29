import type { CloudInventorySummary, CloudRuntimeWarning } from './cloudInventory'
import type { ExecutionBackend, RuntimeKind } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

export function CloudSettingsSection(props: {
    executionBackend: ExecutionBackend
    runtimeKind: RuntimeKind
    environmentId: string
    repositoryUrl: string
    repositoryBranch: string
    workspaceMode: 'ephemeral' | 'persistent' | 'snapshot-derived'
    persistentWorkspace: boolean
    ttlMinutes: string
    cloudInventorySummary: CloudInventorySummary
    selectedProviderType?: 'self-hosted' | 'managed'
    selectedWorkerLifecycle?: string
    runtimeWarning: CloudRuntimeWarning | null
    isDisabled: boolean
    onExecutionBackendChange: (value: ExecutionBackend) => void
    onRuntimeKindChange: (value: RuntimeKind) => void
    onEnvironmentIdChange: (value: string) => void
    onRepositoryUrlChange: (value: string) => void
    onRepositoryBranchChange: (value: string) => void
    onWorkspaceModeChange: (value: 'ephemeral' | 'persistent' | 'snapshot-derived') => void
    onPersistentWorkspaceChange: (value: boolean) => void
    onTtlMinutesChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const isCloud = props.executionBackend !== 'local'

    return (
        <div className="flex flex-col gap-3 px-3 py-3">
            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--app-hint)]">
                    {t('newSession.executionBackend')}
                </label>
                <div className="flex flex-col gap-2 text-sm">
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="executionBackend"
                            checked={props.executionBackend === 'local'}
                            onChange={() => props.onExecutionBackendChange('local')}
                            disabled={props.isDisabled}
                            className="accent-[var(--app-link)]"
                        />
                        <span>{t('newSession.executionBackend.local')}</span>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="executionBackend"
                            checked={props.executionBackend === 'cloud-self-hosted'}
                            onChange={() => props.onExecutionBackendChange('cloud-self-hosted')}
                            disabled={props.isDisabled}
                            className="accent-[var(--app-link)]"
                        />
                        <span>{t('newSession.executionBackend.cloudSelfHosted')}</span>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="executionBackend"
                            checked={props.executionBackend === 'cloud-managed'}
                            onChange={() => props.onExecutionBackendChange('cloud-managed')}
                            disabled={props.isDisabled}
                            className="accent-[var(--app-link)]"
                        />
                        <span>{t('newSession.executionBackend.cloudManaged')}</span>
                    </label>
                </div>
            </div>

            {isCloud ? (
                <>
                    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)]/40 px-3 py-2 text-xs text-[var(--app-hint)]">
                        <div className="font-medium text-[var(--app-fg)]">
                            {t('newSession.cloudInventory.title')}
                        </div>
                        <div className="mt-1">
                            {t('newSession.cloudInventory.providerCount', { count: props.cloudInventorySummary.providerCount })}
                        </div>
                        <div className="mt-1">
                            {t('newSession.cloudInventory.workerCount', { count: props.cloudInventorySummary.workerCount })}
                        </div>
                        <div className="mt-1">
                            {t('newSession.cloudInventory.activeWorkers', {
                                active: props.cloudInventorySummary.activeWorkerCount,
                                total: props.cloudInventorySummary.workerCount
                            })}
                        </div>
                        {props.selectedProviderType ? (
                            <div className="mt-1">
                                {t(`newSession.cloudInventory.type.${props.selectedProviderType === 'managed' ? 'managed' : 'selfHosted'}`)}
                            </div>
                        ) : null}
                        {props.selectedWorkerLifecycle ? (
                            <div className="mt-1">
                                {t('newSession.cloudInventory.lifecycle')}: {props.selectedWorkerLifecycle}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]">
                            {t('newSession.runtimeKind')}
                        </label>
                        <div className="flex flex-col gap-2 text-sm">
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="runtimeKind"
                                    checked={props.runtimeKind === 'host-process'}
                                    onChange={() => props.onRuntimeKindChange('host-process')}
                                    disabled={props.isDisabled}
                                    className="accent-[var(--app-link)]"
                                />
                                <span>{t('newSession.runtimeKind.hostProcess')}</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="runtimeKind"
                                    checked={props.runtimeKind === 'docker-session'}
                                    onChange={() => props.onRuntimeKindChange('docker-session')}
                                    disabled={props.isDisabled}
                                    className="accent-[var(--app-link)]"
                                />
                                <span>{t('newSession.runtimeKind.dockerSession')}</span>
                            </label>
                        </div>
                    </div>

                    {props.runtimeWarning ? (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                            {t(`newSession.cloudWarning.${props.runtimeWarning}`)}
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-environment-id">
                            {t('newSession.environmentId')}
                        </label>
                        <input
                            id="new-session-environment-id"
                            type="text"
                            placeholder={t('newSession.environmentIdPlaceholder')}
                            value={props.environmentId}
                            onChange={(event) => props.onEnvironmentIdChange(event.target.value)}
                            disabled={props.isDisabled}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-repository-url">
                            {t('newSession.repositoryUrl')}
                        </label>
                        <input
                            id="new-session-repository-url"
                            type="text"
                            placeholder="https://github.com/org/repo.git"
                            value={props.repositoryUrl}
                            onChange={(event) => props.onRepositoryUrlChange(event.target.value)}
                            disabled={props.isDisabled}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-repository-branch">
                            {t('newSession.repositoryBranch')}
                        </label>
                        <input
                            id="new-session-repository-branch"
                            type="text"
                            placeholder="main"
                            value={props.repositoryBranch}
                            onChange={(event) => props.onRepositoryBranchChange(event.target.value)}
                            disabled={props.isDisabled}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-workspace-mode">
                            {t('newSession.workspaceMode')}
                        </label>
                        <select
                            id="new-session-workspace-mode"
                            value={props.workspaceMode}
                            onChange={(event) => props.onWorkspaceModeChange(event.target.value as 'ephemeral' | 'persistent' | 'snapshot-derived')}
                            disabled={props.isDisabled}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        >
                            <option value="ephemeral">{t('newSession.workspaceMode.ephemeral')}</option>
                            <option value="persistent">{t('newSession.workspaceMode.persistent')}</option>
                            <option value="snapshot-derived">{t('newSession.workspaceMode.snapshotDerived')}</option>
                        </select>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={props.persistentWorkspace}
                            onChange={(event) => props.onPersistentWorkspaceChange(event.target.checked)}
                            disabled={props.isDisabled}
                            className="accent-[var(--app-link)]"
                        />
                        <span>{t('newSession.persistentWorkspace')}</span>
                    </label>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-ttl-minutes">
                            {t('newSession.ttlMinutes')}
                        </label>
                        <input
                            id="new-session-ttl-minutes"
                            type="number"
                            min={1}
                            step={1}
                            placeholder="120"
                            value={props.ttlMinutes}
                            onChange={(event) => props.onTtlMinutesChange(event.target.value)}
                            disabled={props.isDisabled}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        />
                    </div>
                </>
            ) : null}
        </div>
    )
}
