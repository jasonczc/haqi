import type { CloudCheckpoint, CloudEnvironmentSummary, ExecutionBackend, RuntimeKind } from '@/types/api'
import type { CloudInventorySummary, CloudRuntimeWarning } from './cloudInventory'
import { useTranslation } from '@/lib/use-translation'

export function CloudSettingsSection(props: {
    executionBackend: ExecutionBackend
    runtimeKind: RuntimeKind
    launchMode: 'interactive' | 'background'
    environmentId: string
    checkpointId: string
    repositoryUrl: string
    repositoryBranch: string
    workspaceMode: 'ephemeral' | 'persistent' | 'snapshot-derived'
    persistentWorkspace: boolean
    networkPolicy: 'default' | 'restricted' | 'off'
    labelsInput: string
    secretsInput: string
    previewAutoDetect: boolean
    previewPreferredPort: string
    ttlMinutes: string
    cloudInventorySummary: CloudInventorySummary
    cloudEnvironments: CloudEnvironmentSummary[]
    cloudCheckpoints: CloudCheckpoint[]
    cloudEnvironmentsLoading?: boolean
    cloudEnvironmentsError?: string | null
    cloudCheckpointsLoading?: boolean
    cloudCheckpointsError?: string | null
    cloudWorkersLoading?: boolean
    hasSelectableWorkers?: boolean
    selectedEnvironmentSummary: CloudEnvironmentSummary | null
    selectedCheckpoint: CloudCheckpoint | null
    selectedProviderType?: 'self-hosted' | 'managed'
    selectedWorkerLifecycle?: string
    runtimeWarning: CloudRuntimeWarning | null
    isDisabled: boolean
    onExecutionBackendChange: (value: ExecutionBackend) => void
    onRuntimeKindChange: (value: RuntimeKind) => void
    onLaunchModeChange: (value: 'interactive' | 'background') => void
    onEnvironmentIdChange: (value: string) => void
    onCheckpointIdChange: (value: string) => void
    onRepositoryUrlChange: (value: string) => void
    onRepositoryBranchChange: (value: string) => void
    onWorkspaceModeChange: (value: 'ephemeral' | 'persistent' | 'snapshot-derived') => void
    onPersistentWorkspaceChange: (value: boolean) => void
    onNetworkPolicyChange: (value: 'default' | 'restricted' | 'off') => void
    onLabelsInputChange: (value: string) => void
    onSecretsInputChange: (value: string) => void
    onPreviewAutoDetectChange: (value: boolean) => void
    onPreviewPreferredPortChange: (value: string) => void
    onTtlMinutesChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const isCloud = props.executionBackend !== 'local'
    const showNoWorkerGuidance = props.executionBackend === 'cloud-self-hosted'
        && !props.cloudWorkersLoading
        && props.hasSelectableWorkers === false
    const selectedEnvironmentMissing = Boolean(props.environmentId.trim())
        && !props.selectedEnvironmentSummary
        && !props.cloudEnvironmentsLoading
        && !props.cloudEnvironmentsError

    const environmentRuntimeLabel = (environment: CloudEnvironmentSummary) => {
        if (environment.runtimeKind === 'docker-session') {
            return t('newSession.cloudEnvironment.runtime.dockerSession')
        }
        if (environment.runtimeKind === 'host-process' || !environment.runtimeKind) {
            return t('newSession.cloudEnvironment.runtime.hostProcess')
        }
        return t('newSession.cloudEnvironment.runtime.unknown')
    }

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
                        {props.selectedEnvironmentSummary ? (
                            <div className="mt-1">
                                {t('newSession.cloudInventory.environmentSummary', {
                                    runtime: environmentRuntimeLabel(props.selectedEnvironmentSummary),
                                    services: props.selectedEnvironmentSummary.serviceCount,
                                    dependencies: props.selectedEnvironmentSummary.repositoryDependenciesCount
                                })}
                            </div>
                        ) : null}
                    </div>

                    {showNoWorkerGuidance ? (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                            <div className="font-medium">{t('cloud.workers.noWorkersOnline')}</div>
                            <a
                                href="/cloud/workers"
                                className="mt-1 block text-[var(--app-link)] hover:underline"
                            >
                                {t('cloud.workers.goToManagement')}
                            </a>
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]">
                            Launch Mode
                        </label>
                        <div className="flex flex-col gap-2 text-sm">
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="launchMode"
                                    checked={props.launchMode === 'interactive'}
                                    onChange={() => props.onLaunchModeChange('interactive')}
                                    disabled={props.isDisabled}
                                    className="accent-[var(--app-link)]"
                                />
                                <span>Interactive</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="launchMode"
                                    checked={props.launchMode === 'background'}
                                    onChange={() => props.onLaunchModeChange('background')}
                                    disabled={props.isDisabled}
                                    className="accent-[var(--app-link)]"
                                />
                                <span>Background</span>
                            </label>
                        </div>
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
                                    checked={props.runtimeKind === 'docker-session'}
                                    onChange={() => props.onRuntimeKindChange('docker-session')}
                                    disabled={props.isDisabled}
                                    className="accent-[var(--app-link)]"
                                />
                                <span>{t('newSession.runtimeKind.dockerSession')}</span>
                            </label>
                        </div>
                        <div className="pt-1 text-[11px] text-[var(--app-hint)]">
                            Cloud runtime is container-backed and checkpoint-based.
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-checkpoint-id">
                            Checkpoint
                        </label>
                        <input
                            id="new-session-checkpoint-id"
                            type="text"
                            placeholder="ghcr.io/org/dev:latest"
                            value={props.checkpointId}
                            onChange={(event) => props.onCheckpointIdChange(event.target.value)}
                            disabled={props.isDisabled}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        />
                        {props.cloudCheckpointsLoading ? (
                            <div className="pt-1 text-[11px] text-[var(--app-hint)]">Loading checkpoints…</div>
                        ) : props.cloudCheckpointsError ? (
                            <div className="pt-1 text-[11px] text-red-600">{props.cloudCheckpointsError}</div>
                        ) : props.cloudCheckpoints.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                                {props.cloudCheckpoints.map((checkpoint) => (
                                    <span
                                        key={checkpoint.id}
                                        className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-1 text-[11px] text-[var(--app-fg)]"
                                        title={checkpoint.image}
                                    >
                                        {checkpoint.id}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {props.selectedCheckpoint ? (
                            <div className="pt-1 text-[11px] text-[var(--app-hint)]">
                                {props.selectedCheckpoint.image}
                            </div>
                        ) : null}
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
                        {props.cloudEnvironmentsLoading ? (
                            <div className="pt-1 text-[11px] text-[var(--app-hint)]">
                                {t('newSession.cloudEnvironment.loading')}
                            </div>
                        ) : props.cloudEnvironmentsError ? (
                            <div className="pt-1 text-[11px] text-red-600">
                                {props.cloudEnvironmentsError}
                            </div>
                        ) : props.cloudEnvironments.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                                {props.cloudEnvironments.map((environment) => (
                                    <span
                                        key={environment.id}
                                        className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-1 text-[11px] text-[var(--app-fg)]"
                                        title={`${environment.runtimeKind ?? 'host-process'} · ${environment.serviceCount} services`}
                                    >
                                        {environment.id} · {environmentRuntimeLabel(environment)} · {environment.serviceCount}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {props.selectedEnvironmentSummary ? (
                            <div className="pt-1 text-[11px] text-[var(--app-hint)]">
                                {t('newSession.cloudEnvironment.selected', { id: props.selectedEnvironmentSummary.id })}
                                {props.selectedEnvironmentSummary.runtimeKind ? ` · ${environmentRuntimeLabel(props.selectedEnvironmentSummary)}` : ''}
                                {props.selectedEnvironmentSummary.hasPreviewPorts ? ` · ${t('newSession.cloudEnvironment.previewPorts')}` : ''}
                            </div>
                        ) : selectedEnvironmentMissing ? (
                            <div className="pt-1 text-[11px] text-amber-600">
                                {t('newSession.cloudEnvironment.selectedMissing')}
                            </div>
                        ) : null}
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
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-network-policy">
                            {t('newSession.networkPolicy')}
                        </label>
                        <select
                            id="new-session-network-policy"
                            value={props.networkPolicy}
                            onChange={(event) => props.onNetworkPolicyChange(event.target.value as 'default' | 'restricted' | 'off')}
                            disabled={props.isDisabled}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        >
                            <option value="default">{t('newSession.networkPolicy.default')}</option>
                            <option value="restricted">{t('newSession.networkPolicy.restricted')}</option>
                            <option value="off">{t('newSession.networkPolicy.off')}</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-labels">
                            {t('newSession.labels')}
                        </label>
                        <textarea
                            id="new-session-labels"
                            placeholder={t('newSession.labelsPlaceholder')}
                            value={props.labelsInput}
                            onChange={(event) => props.onLabelsInputChange(event.target.value)}
                            disabled={props.isDisabled}
                            rows={2}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        />
                        <div className="text-[11px] text-[var(--app-hint)]">
                            {t('newSession.labelsHint')}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-secrets">
                                {t('newSession.secrets')}
                            </label>
                            <a
                                href="/cloud/secrets"
                                className="text-[11px] text-[var(--app-link)] hover:underline"
                            >
                                Manage secrets
                            </a>
                        </div>
                        <textarea
                            id="new-session-secrets"
                            placeholder={t('newSession.secretsPlaceholder')}
                            value={props.secretsInput}
                            onChange={(event) => props.onSecretsInputChange(event.target.value)}
                            disabled={props.isDisabled}
                            rows={2}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                        />
                        <div className="text-[11px] text-[var(--app-hint)]">
                            {t('newSession.secretsHint')}
                        </div>
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

                    <div className="flex flex-col gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)]/40 px-3 py-2">
                        <div className="text-xs font-medium text-[var(--app-hint)]">
                            {t('newSession.previewPolicy')}
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={props.previewAutoDetect}
                                onChange={(event) => props.onPreviewAutoDetectChange(event.target.checked)}
                                disabled={props.isDisabled}
                                className="accent-[var(--app-link)]"
                            />
                            <span>{t('newSession.previewPolicy.autoDetect')}</span>
                        </label>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="new-session-preview-port">
                                {t('newSession.previewPolicy.preferredPort')}
                            </label>
                            <input
                                id="new-session-preview-port"
                                type="number"
                                min={1}
                                step={1}
                                placeholder="3000"
                                value={props.previewPreferredPort}
                                onChange={(event) => props.onPreviewPreferredPortChange(event.target.value)}
                                disabled={props.isDisabled}
                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                            />
                        </div>
                    </div>

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
