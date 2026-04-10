import { Link } from '@tanstack/react-router'
import {
    CursorChoiceRow,
    CursorFieldHint,
    CursorFieldLabel,
    CursorNotice,
    CursorSettingsCard,
    CursorSettingsBadge,
    CursorSelect,
    CursorTextArea,
    CursorTextField,
    CursorToggleRow,
} from '@/components/settings/CursorSettingsPrimitives'
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
                <CursorFieldLabel>{t('newSession.executionBackend')}</CursorFieldLabel>
                <div className="flex flex-col gap-2">
                    <CursorChoiceRow
                        name="executionBackend"
                        value="local"
                        checked={props.executionBackend === 'local'}
                        onChange={() => props.onExecutionBackendChange('local')}
                        disabled={props.isDisabled}
                        label={t('newSession.executionBackend.local')}
                    />
                    <CursorChoiceRow
                        name="executionBackend"
                        value="cloud-self-hosted"
                        checked={props.executionBackend === 'cloud-self-hosted'}
                        onChange={() => props.onExecutionBackendChange('cloud-self-hosted')}
                        disabled={props.isDisabled}
                        label={t('newSession.executionBackend.cloudSelfHosted')}
                    />
                    <CursorChoiceRow
                        name="executionBackend"
                        value="cloud-managed"
                        checked={props.executionBackend === 'cloud-managed'}
                        onChange={() => props.onExecutionBackendChange('cloud-managed')}
                        disabled={props.isDisabled}
                        label={t('newSession.executionBackend.cloudManaged')}
                    />
                </div>
            </div>

            {isCloud ? (
                <>
                    <CursorSettingsCard className="border-[var(--border-secondary)] bg-[var(--bg-quinary)] px-3 py-3 shadow-none">
                        <div className="text-[12px] leading-4 font-medium text-[var(--text-primary)]">
                            {t('newSession.cloudInventory.title')}
                        </div>
                        <div className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                            {t('newSession.cloudInventory.providerCount', { count: props.cloudInventorySummary.providerCount })}
                        </div>
                        <div className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                            {t('newSession.cloudInventory.workerCount', { count: props.cloudInventorySummary.workerCount })}
                        </div>
                        <div className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                            {t('newSession.cloudInventory.activeWorkers', {
                                active: props.cloudInventorySummary.activeWorkerCount,
                                total: props.cloudInventorySummary.workerCount
                            })}
                        </div>
                        {props.selectedProviderType ? (
                            <div className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                                {t(`newSession.cloudInventory.type.${props.selectedProviderType === 'managed' ? 'managed' : 'selfHosted'}`)}
                            </div>
                        ) : null}
                        {props.selectedWorkerLifecycle ? (
                            <div className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                                {t('newSession.cloudInventory.lifecycle')}: {props.selectedWorkerLifecycle}
                            </div>
                        ) : null}
                        {props.selectedEnvironmentSummary ? (
                            <div className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                                {t('newSession.cloudInventory.environmentSummary', {
                                    runtime: environmentRuntimeLabel(props.selectedEnvironmentSummary),
                                    services: props.selectedEnvironmentSummary.serviceCount,
                                    dependencies: props.selectedEnvironmentSummary.repositoryDependenciesCount
                                })}
                            </div>
                        ) : null}
                    </CursorSettingsCard>

                    {showNoWorkerGuidance ? (
                        <CursorNotice>
                            <div className="font-medium">{t('cloud.workers.noWorkersOnline')}</div>
                            <Link
                                to="/settings/cloud-agents"
                                className="mt-1 block text-[var(--accent)] hover:underline"
                            >
                                {t('cloud.workers.goToManagement')}
                            </Link>
                        </CursorNotice>
                    ) : null}

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel>Launch Mode</CursorFieldLabel>
                        <div className="flex flex-col gap-2">
                            <CursorChoiceRow
                                name="launchMode"
                                value="interactive"
                                checked={props.launchMode === 'interactive'}
                                onChange={() => props.onLaunchModeChange('interactive')}
                                disabled={props.isDisabled}
                                label="Interactive"
                            />
                            <CursorChoiceRow
                                name="launchMode"
                                value="background"
                                checked={props.launchMode === 'background'}
                                onChange={() => props.onLaunchModeChange('background')}
                                disabled={props.isDisabled}
                                label="Background"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel>{t('newSession.runtimeKind')}</CursorFieldLabel>
                        <div className="flex flex-col gap-2">
                            <CursorChoiceRow
                                name="runtimeKind"
                                value="docker-session"
                                checked={props.runtimeKind === 'docker-session'}
                                onChange={() => props.onRuntimeKindChange('docker-session')}
                                disabled={props.isDisabled}
                                label={t('newSession.runtimeKind.dockerSession')}
                            />
                            <CursorChoiceRow
                                name="runtimeKind"
                                value="daemon-session"
                                checked={props.runtimeKind === 'daemon-session'}
                                onChange={() => props.onRuntimeKindChange('daemon-session')}
                                disabled={props.isDisabled}
                                label="Daemon Session"
                            />
                        </div>
                        <CursorFieldHint>
                            {props.runtimeKind === 'daemon-session'
                                ? 'Long-running daemon container on the cloud worker.'
                                : 'Cloud runtime is container-backed and checkpoint-based.'}
                        </CursorFieldHint>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-checkpoint-id">Checkpoint</CursorFieldLabel>
                        <CursorTextField
                            id="new-session-checkpoint-id"
                            type="text"
                            placeholder="ghcr.io/org/dev:latest"
                            value={props.checkpointId}
                            onChange={(event) => props.onCheckpointIdChange(event.target.value)}
                            disabled={props.isDisabled}
                        />
                        {props.cloudCheckpointsLoading ? (
                            <CursorFieldHint>Loading checkpoints…</CursorFieldHint>
                        ) : props.cloudCheckpointsError ? (
                            <CursorFieldHint tone="danger">{props.cloudCheckpointsError}</CursorFieldHint>
                        ) : props.cloudCheckpoints.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                                {props.cloudCheckpoints.map((checkpoint) => (
                                    <CursorSettingsBadge
                                        key={checkpoint.id}
                                        className="rounded-full"
                                        title={checkpoint.image}
                                    >
                                        {checkpoint.id}
                                    </CursorSettingsBadge>
                                ))}
                            </div>
                        ) : null}
                        {props.selectedCheckpoint ? (
                            <CursorFieldHint>{props.selectedCheckpoint.image}</CursorFieldHint>
                        ) : null}
                    </div>

                    {props.runtimeWarning ? (
                        <CursorNotice>
                            {t(`newSession.cloudWarning.${props.runtimeWarning}`)}
                        </CursorNotice>
                    ) : null}

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-environment-id">{t('newSession.environmentId')}</CursorFieldLabel>
                        <CursorTextField
                            id="new-session-environment-id"
                            type="text"
                            placeholder={t('newSession.environmentIdPlaceholder')}
                            value={props.environmentId}
                            onChange={(event) => props.onEnvironmentIdChange(event.target.value)}
                            disabled={props.isDisabled}
                        />
                        {props.cloudEnvironmentsLoading ? (
                            <CursorFieldHint>{t('newSession.cloudEnvironment.loading')}</CursorFieldHint>
                        ) : props.cloudEnvironmentsError ? (
                            <CursorFieldHint tone="danger">{props.cloudEnvironmentsError}</CursorFieldHint>
                        ) : props.cloudEnvironments.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                                {props.cloudEnvironments.map((environment) => (
                                    <CursorSettingsBadge
                                        key={environment.id}
                                        className="rounded-full"
                                        title={`${environment.runtimeKind ?? 'host-process'} · ${environment.serviceCount} services`}
                                    >
                                        {environment.id} · {environmentRuntimeLabel(environment)} · {environment.serviceCount}
                                    </CursorSettingsBadge>
                                ))}
                            </div>
                        ) : null}
                        {props.selectedEnvironmentSummary ? (
                            <CursorFieldHint>
                                {t('newSession.cloudEnvironment.selected', { id: props.selectedEnvironmentSummary.id })}
                                {props.selectedEnvironmentSummary.runtimeKind ? ` · ${environmentRuntimeLabel(props.selectedEnvironmentSummary)}` : ''}
                                {props.selectedEnvironmentSummary.hasPreviewPorts ? ` · ${t('newSession.cloudEnvironment.previewPorts')}` : ''}
                            </CursorFieldHint>
                        ) : selectedEnvironmentMissing ? (
                            <CursorFieldHint tone="accent">{t('newSession.cloudEnvironment.selectedMissing')}</CursorFieldHint>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-repository-url">{t('newSession.repositoryUrl')}</CursorFieldLabel>
                        <CursorTextField
                            id="new-session-repository-url"
                            type="text"
                            placeholder="https://github.com/org/repo.git"
                            value={props.repositoryUrl}
                            onChange={(event) => props.onRepositoryUrlChange(event.target.value)}
                            disabled={props.isDisabled}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-repository-branch">{t('newSession.repositoryBranch')}</CursorFieldLabel>
                        <CursorTextField
                            id="new-session-repository-branch"
                            type="text"
                            placeholder="main"
                            value={props.repositoryBranch}
                            onChange={(event) => props.onRepositoryBranchChange(event.target.value)}
                            disabled={props.isDisabled}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-network-policy">{t('newSession.networkPolicy')}</CursorFieldLabel>
                        <CursorSelect
                            id="new-session-network-policy"
                            value={props.networkPolicy}
                            onChange={(event) => props.onNetworkPolicyChange(event.target.value as 'default' | 'restricted' | 'off')}
                            disabled={props.isDisabled}
                            className="min-w-0"
                        >
                            <option value="default">{t('newSession.networkPolicy.default')}</option>
                            <option value="restricted">{t('newSession.networkPolicy.restricted')}</option>
                            <option value="off">{t('newSession.networkPolicy.off')}</option>
                        </CursorSelect>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-labels">{t('newSession.labels')}</CursorFieldLabel>
                        <CursorTextArea
                            id="new-session-labels"
                            placeholder={t('newSession.labelsPlaceholder')}
                            value={props.labelsInput}
                            onChange={(event) => props.onLabelsInputChange(event.target.value)}
                            disabled={props.isDisabled}
                            rows={2}
                        />
                        <CursorFieldHint className="pt-0">{t('newSession.labelsHint')}</CursorFieldHint>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel
                            htmlFor="new-session-secrets"
                            action={(
                                <a
                                    href="/settings/cloud-agents"
                                    className="text-[11px] text-[var(--accent)] hover:underline"
                                >
                                    Manage secrets
                                </a>
                            )}
                        >
                            {t('newSession.secrets')}
                        </CursorFieldLabel>
                        <CursorTextArea
                            id="new-session-secrets"
                            placeholder={t('newSession.secretsPlaceholder')}
                            value={props.secretsInput}
                            onChange={(event) => props.onSecretsInputChange(event.target.value)}
                            disabled={props.isDisabled}
                            rows={2}
                        />
                        <CursorFieldHint className="pt-0">{t('newSession.secretsHint')}</CursorFieldHint>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-workspace-mode">{t('newSession.workspaceMode')}</CursorFieldLabel>
                        <CursorSelect
                            id="new-session-workspace-mode"
                            value={props.workspaceMode}
                            onChange={(event) => props.onWorkspaceModeChange(event.target.value as 'ephemeral' | 'persistent' | 'snapshot-derived')}
                            disabled={props.isDisabled}
                            className="min-w-0"
                        >
                            <option value="ephemeral">{t('newSession.workspaceMode.ephemeral')}</option>
                            <option value="persistent">{t('newSession.workspaceMode.persistent')}</option>
                            <option value="snapshot-derived">{t('newSession.workspaceMode.snapshotDerived')}</option>
                        </CursorSelect>
                    </div>

                    <CursorToggleRow
                        label={t('newSession.persistentWorkspace')}
                        checked={props.persistentWorkspace}
                        onCheckedChange={props.onPersistentWorkspaceChange}
                        disabled={props.isDisabled}
                    />

                    <div className="flex flex-col gap-3 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-quinary)] px-3 py-3">
                        <CursorFieldLabel>{t('newSession.previewPolicy')}</CursorFieldLabel>
                        <CursorToggleRow
                            label={t('newSession.previewPolicy.autoDetect')}
                            checked={props.previewAutoDetect}
                            onCheckedChange={props.onPreviewAutoDetectChange}
                            disabled={props.isDisabled}
                            className="border-0 bg-transparent px-0 py-0"
                        />
                        <div className="flex flex-col gap-1.5">
                            <CursorFieldLabel htmlFor="new-session-preview-port">{t('newSession.previewPolicy.preferredPort')}</CursorFieldLabel>
                            <CursorTextField
                                id="new-session-preview-port"
                                type="number"
                                min={1}
                                step={1}
                                placeholder="3000"
                                value={props.previewPreferredPort}
                                onChange={(event) => props.onPreviewPreferredPortChange(event.target.value)}
                                disabled={props.isDisabled}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <CursorFieldLabel htmlFor="new-session-ttl-minutes">{t('newSession.ttlMinutes')}</CursorFieldLabel>
                        <CursorTextField
                            id="new-session-ttl-minutes"
                            type="number"
                            min={1}
                            step={1}
                            placeholder="120"
                            value={props.ttlMinutes}
                            onChange={(event) => props.onTtlMinutesChange(event.target.value)}
                            disabled={props.isDisabled}
                        />
                    </div>
                </>
            ) : null}
        </div>
    )
}
