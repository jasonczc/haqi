import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
    CursorButton,
    CursorCodeBlock,
    CursorFieldLabel,
    CursorNotice,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsSection,
    CursorSelect,
    CursorTextField,
} from '@/components/settings/CursorSettingsPrimitives'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'

type AgentFlavor = 'claude' | 'codex' | 'gemini'

const AGENT_OPTIONS: { value: AgentFlavor; label: string }[] = [
    { value: 'claude', label: 'Claude' },
    { value: 'codex', label: 'Codex' },
    { value: 'gemini', label: 'Gemini' },
]

// ── Step 1: Add Worker ──────────────────────────────────────────────────────

function StepAddWorker(props: { onNext: () => void }) {
    const { api, baseUrl } = useAppContext()
    const queryClient = useQueryClient()
    const [tokenLabel, setTokenLabel] = useState('')
    const [tokenTtl, setTokenTtl] = useState('1440')
    const [generatedToken, setGeneratedToken] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const autoAdvanced = useRef(false)
    const [startingLocal, setStartingLocal] = useState(false)
    const [localStartError, setLocalStartError] = useState<string | null>(null)

    const tokenMutation = useMutation({
        mutationFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.createCloudWorkerEnrollmentToken({
                label: tokenLabel.trim() || undefined,
                ttlMinutes: tokenTtl.trim() ? Number(tokenTtl.trim()) : undefined,
            })
        },
        onSuccess: async (result) => {
            setGeneratedToken(result.token)
            setTokenLabel('')
            setCopied(false)
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkerEnrollmentTokens })
        },
    })

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
        refetchInterval: 3000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        },
    })

    useEffect(() => {
        if (!autoAdvanced.current && (workersQuery.data?.workers?.some((worker) => worker.active) ?? false)) {
            autoAdvanced.current = true
            props.onNext()
        }
    }, [workersQuery.data, props])

    const hubUrl = baseUrl || window.location.origin
    const installCommand = generatedToken
        ? `haqi worker start --token ${generatedToken} --hub-url ${hubUrl}`
        : ''

    function handleCopy(text: string) {
        void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }).catch(() => undefined)
    }

    async function handleStartLocal() {
        if (!api) return
        setStartingLocal(true)
        setLocalStartError(null)
        try {
            await api.startLocalWorker()
            void queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkers() })
        } catch (err) {
            setLocalStartError(err instanceof Error ? err.message : 'Failed to start worker')
        } finally {
            setStartingLocal(false)
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-[16px] leading-6 font-semibold text-[var(--text-primary)]">Step 1: Add a Worker</h2>
                <p className="mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
                    A worker runs on your machine and executes cloud agent tasks.
                    This page will automatically advance once a worker comes online.
                </p>
            </div>

            <CursorSettingsCard className="border-[var(--border-secondary)] bg-[var(--bg-quinary)] p-4 shadow-none">
                <div className="text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">Quick Start</div>
                <p className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                    Start a worker process directly on this machine with one click.
                </p>
                <CursorButton
                    type="button"
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleStartLocal()}
                    disabled={startingLocal}
                >
                    {startingLocal ? 'Starting...' : 'Start Worker on This Machine'}
                </CursorButton>
                {localStartError ? (
                    <CursorNotice tone="danger" className="mt-2">
                        {localStartError}
                    </CursorNotice>
                ) : null}
            </CursorSettingsCard>

            <div className="text-[12px] leading-4 text-[var(--text-secondary)]">Or generate a token to connect a remote worker:</div>

            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[14rem] flex-1">
                    <div className="mb-1">
                        <CursorFieldLabel>Label (optional)</CursorFieldLabel>
                    </div>
                    <CursorTextField
                        type="text"
                        placeholder="e.g. gpu-worker-1"
                        value={tokenLabel}
                        onChange={(e) => setTokenLabel(e.target.value)}
                    />
                </div>
                <div className="w-28">
                    <div className="mb-1">
                        <CursorFieldLabel>TTL (min)</CursorFieldLabel>
                    </div>
                    <CursorTextField
                        type="number"
                        min={1}
                        value={tokenTtl}
                        onChange={(e) => setTokenTtl(e.target.value)}
                    />
                </div>
                <CursorButton
                    type="button"
                    size="sm"
                    onClick={() => tokenMutation.mutate()}
                    disabled={tokenMutation.isPending}
                >
                    {tokenMutation.isPending ? 'Generating...' : 'Generate Token'}
                </CursorButton>
            </div>

            {tokenMutation.error instanceof Error ? (
                <CursorNotice tone="danger">{tokenMutation.error.message}</CursorNotice>
            ) : null}

            {generatedToken ? (
                <CursorSettingsCard className="border-[var(--border-success)] bg-[var(--bg-success-quaternary)] p-4 shadow-none">
                    <div className="text-[13px] leading-[18px] font-semibold text-[var(--success)]">
                        Token generated. Copy it now; it will not be shown again.
                    </div>
                    <div className="mt-3 flex items-start gap-2">
                        <CursorCodeBlock>
                            {generatedToken}
                        </CursorCodeBlock>
                        <CursorButton
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(generatedToken)}
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </CursorButton>
                    </div>
                    <div className="mt-4">
                        <CursorFieldLabel>Install command</CursorFieldLabel>
                        <div className="mt-2 flex items-start gap-2">
                            <CursorCodeBlock>
                                {installCommand}
                            </CursorCodeBlock>
                            <CursorButton
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopy(installCommand)}
                            >
                                Copy
                            </CursorButton>
                        </div>
                    </div>
                </CursorSettingsCard>
            ) : null}

            {workersQuery.data?.workers?.length ? (
                <div className="text-[13px] leading-[18px] text-[var(--success)]">
                    Worker connected — advancing…
                </div>
            ) : generatedToken ? (
                <div className="text-[12px] leading-4 text-[var(--text-secondary)]">
                    Waiting for worker to come online…
                </div>
            ) : null}

            <div className="flex justify-end">
                <CursorButton type="button" variant="outline" size="sm" onClick={props.onNext}>
                    Skip
                </CursorButton>
            </div>
        </div>
    )
}

// ── Step 2: Setup Environment ───────────────────────────────────────────────

function StepPrepareRuntime(props: { onNext: () => void }) {
    const { api } = useAppContext()
    const queryClient = useQueryClient()
    const [error, setError] = useState<string | null>(null)

    const runtimeQuery = useQuery({
        queryKey: queryKeys.localRuntime,
        enabled: Boolean(api),
        refetchInterval: 3000,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getLocalRuntimeStatus()
        },
    })

    useEffect(() => {
        if (runtimeQuery.data?.ready) {
            props.onNext()
        }
    }, [runtimeQuery.data?.ready, props])

    async function handlePrepareRuntime() {
        if (!api) return
        setError(null)
        try {
            await api.prepareLocalRuntime()
            await queryClient.invalidateQueries({ queryKey: queryKeys.localRuntime })
            await queryClient.invalidateQueries({ queryKey: queryKeys.cloudWorkers() })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to prepare runtime')
        }
    }

    const latestLog = runtimeQuery.data?.logs?.at(-1)

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-[16px] leading-6 font-semibold text-[var(--text-primary)]">Step 2: Prepare Runtime</h2>
                <p className="mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
                    Build the Docker runtime image once on this machine. Setup sessions will use this image for desktop and container features.
                </p>
            </div>

            <CursorSettingsCard className="border-[var(--border-secondary)] bg-[var(--bg-quinary)] p-4 shadow-none">
                <div className="text-[13px] leading-[18px] font-semibold text-[var(--text-primary)]">Runtime image</div>
                <p className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                    Image: <code>haqi-workspace:dev</code>
                </p>
                <CursorButton
                    type="button"
                    size="sm"
                    className="mt-2"
                    onClick={() => void handlePrepareRuntime()}
                    disabled={runtimeQuery.data?.running}
                >
                    {runtimeQuery.data?.running ? 'Preparing...' : 'Prepare Runtime'}
                </CursorButton>
                {error ? (
                    <CursorNotice tone="danger" className="mt-2">
                        {error}
                    </CursorNotice>
                ) : null}
                <div className="mt-2 text-[12px] leading-4 text-[var(--text-secondary)]">
                    {runtimeQuery.data?.ready
                        ? 'Runtime ready — advancing…'
                        : runtimeQuery.data?.running
                            ? (latestLog ?? 'Building haqi-workspace:dev…')
                            : 'Build the Docker runtime before starting setup.'}
                </div>
            </CursorSettingsCard>

            <div className="flex justify-end">
                <CursorButton type="button" variant="outline" size="sm" onClick={props.onNext}>
                    Skip
                </CursorButton>
            </div>
        </div>
    )
}

// ── Step 3: Setup Environment ───────────────────────────────────────────────

function StepSetupEnvironment(props: { onNext: () => void }) {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [repoUrl, setRepoUrl] = useState('')
    const [agent, setAgent] = useState<AgentFlavor>('claude')
    const [error, setError] = useState<string | null>(null)
    const { spawnSession, isPending } = useSpawnSession(api)

    const workersQuery = useQuery({
        queryKey: queryKeys.cloudWorkers(),
        enabled: Boolean(api),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getCloudWorkers()
        },
    })

    const workers = workersQuery.data?.workers ?? []
    const firstWorker = workers.find((worker) => worker.active && worker.selectable) ?? null

    async function handleStartSetup() {
        if (!firstWorker) {
            setError('No workers available. Please add a worker first.')
            return
        }
        setError(null)
        try {
            const result = await spawnSession({
                machineId: firstWorker.machineId,
                agent,
                sessionType: 'setup',
                executionBackend: firstWorker.executorType ?? 'cloud-self-hosted',
                runtimeKind: 'daemon-session',
                workspaceSource: repoUrl.trim()
                    ? { repository: { url: repoUrl.trim() } }
                    : undefined,
                yolo: true,
            })
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            if (result.type === 'success') {
                void navigate({ to: '/sessions/$sessionId', params: { sessionId: result.sessionId } })
            } else if (result.type === 'accepted') {
                void queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequests })
                void navigate({ to: '/settings/requests/$requestId', params: { requestId: result.requestId } })
            } else {
                setError('Failed to start session')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start setup')
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-[16px] leading-6 font-semibold text-[var(--text-primary)]">Step 3: Setup Environment</h2>
                <p className="mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
                    Provide a repository URL and choose an agent. The agent will clone the repo and set up your workspace.
                    You'll be taken to the session to watch the agent configure your environment.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <div>
                    <label className="mb-1 block text-[12px] leading-4 font-medium text-[var(--text-secondary)]">
                        Repository URL (optional)
                    </label>
                    <CursorTextField
                        type="url"
                        placeholder="https://github.com/org/repo"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                    />
                </div>

                <div>
                    <label className="mb-1 block text-[12px] leading-4 font-medium text-[var(--text-secondary)]">
                        Agent
                    </label>
                    <CursorSelect
                        value={agent}
                        onChange={(e) => setAgent(e.target.value as AgentFlavor)}
                        className="min-w-0"
                    >
                        {AGENT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </CursorSelect>
                </div>
            </div>

            {!firstWorker ? (
                <div className="text-[13px] leading-[18px] text-[var(--text-secondary)]">
                    No workers found. You can skip this step and set up your environment manually later.
                </div>
            ) : null}

            {error ? (
                <div className="text-[13px] leading-[18px] text-[var(--danger)]">{error}</div>
            ) : null}

            <div className="flex items-center justify-between">
                <CursorButton
                    type="button"
                    size="sm"
                    onClick={() => void handleStartSetup()}
                    disabled={isPending || !firstWorker}
                >
                    {isPending ? 'Starting...' : 'Start Setup'}
                </CursorButton>
                <CursorButton type="button" variant="outline" size="sm" onClick={props.onNext}>
                    Skip
                </CursorButton>
            </div>
        </div>
    )
}

// ── Step 4: Save Checkpoint ─────────────────────────────────────────────────

function StepSaveCheckpoint(props: { onNext: () => void }) {
    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-[16px] leading-6 font-semibold text-[var(--text-primary)]">Step 4: Save a Checkpoint</h2>
                <p className="mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
                    Once the setup session finishes, save a checkpoint of your configured environment.
                    Checkpoints let you spawn new agents from the same starting state instantly.
                </p>
            </div>

            <div className="rounded-lg border border-[var(--border-accent)] bg-[var(--bg-accent-tertiary)] px-4 py-3 text-[13px] leading-[18px] text-[var(--accent)]">
                In the session view, click the <strong>Save Checkpoint</strong> button after the agent finishes setting up.
                Then come back here and click the button below.
            </div>

            <div className="flex items-center justify-between">
                <CursorButton type="button" size="sm" onClick={props.onNext}>
                    I've saved a checkpoint
                </CursorButton>
                <CursorButton type="button" variant="outline" size="sm" onClick={props.onNext}>
                    Skip
                </CursorButton>
            </div>
        </div>
    )
}

// ── Step 5: Secrets ─────────────────────────────────────────────────────────

type ExtraSecret = { key: string; value: string }

function StepSecrets() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const [githubToken, setGithubToken] = useState('')
    const [extras, setExtras] = useState<ExtraSecret[]>([{ key: '', value: '' }])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    function updateExtra(index: number, field: keyof ExtraSecret, val: string) {
        setExtras((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
    }

    function addExtra() {
        setExtras((prev) => [...prev, { key: '', value: '' }])
    }

    function removeExtra(index: number) {
        setExtras((prev) => prev.filter((_, i) => i !== index))
    }

    async function handleFinish() {
        if (!githubToken.trim()) {
            setError('GITHUB_TOKEN is required.')
            return
        }
        if (!api) {
            setError('API unavailable.')
            return
        }
        setError(null)
        setSaving(true)
        try {
            await api.createCloudSecret({
                name: 'GITHUB_TOKEN',
                value: githubToken.trim(),
                adapter: 'git',
                mountAs: 'env',
                envName: 'GITHUB_TOKEN',
            })

            for (const extra of extras) {
                if (extra.key.trim() && extra.value.trim()) {
                    await api.createCloudSecret({
                        name: extra.key.trim(),
                        value: extra.value.trim(),
                        mountAs: 'env',
                        envName: extra.key.trim(),
                    })
                }
            }

            localStorage.setItem('haqi-onboard-complete', 'true')
            void navigate({ to: '/settings/cloud-agents' })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save secrets')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-[16px] leading-6 font-semibold text-[var(--text-primary)]">Step 5: Add Secrets</h2>
                <p className="mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
                    Add credentials that your cloud agents will use. These are stored securely on the hub.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <div>
                    <label className="mb-1 block text-[12px] leading-4 font-medium text-[var(--text-secondary)]">
                        GITHUB_TOKEN <span className="text-[var(--danger)]">*</span>
                    </label>
                    <CursorTextField
                        type="password"
                        placeholder="ghp_..."
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                    />
                    <p className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">
                        Required. Used by agents to clone repos and create pull requests.
                        Create one at{' '}
                        <a
                            href="https://github.com/settings/tokens"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--accent)] underline hover:no-underline"
                        >
                            github.com/settings/tokens
                        </a>
                        .
                    </p>
                </div>

                <div>
                    <div className="mb-2 text-[12px] leading-4 font-medium text-[var(--text-secondary)]">
                        Additional secrets (optional)
                    </div>
                    {extras.map((extra, index) => (
                        <div key={index} className="mb-2 flex gap-2">
                            <CursorTextField
                                type="text"
                                placeholder="KEY"
                                value={extra.key}
                                onChange={(e) => updateExtra(index, 'key', e.target.value)}
                                className="w-40"
                                mono
                            />
                            <CursorTextField
                                type="password"
                                placeholder="value"
                                value={extra.value}
                                onChange={(e) => updateExtra(index, 'value', e.target.value)}
                                className="flex-1"
                            />
                            <CursorButton
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeExtra(index)}
                            >
                                ×
                            </CursorButton>
                        </div>
                    ))}
                    <CursorButton type="button" variant="outline" size="sm" onClick={addExtra}>
                        + Add secret
                    </CursorButton>
                </div>
            </div>

            {error ? (
                <div className="text-[13px] leading-[18px] text-[var(--danger)]">{error}</div>
            ) : null}

            <div className="flex justify-end">
                <CursorButton
                    type="button"
                    size="sm"
                    onClick={() => void handleFinish()}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Finish'}
                </CursorButton>
            </div>
        </div>
    )
}

// ── Step indicator ──────────────────────────────────────────────────────────

const STEP_LABELS = ['Add Worker', 'Prepare Runtime', 'Setup Environment', 'Save Checkpoint', 'Secrets']

function StepIndicator(props: { current: number }) {
    return (
        <div className="flex items-center gap-2">
            {STEP_LABELS.map((label, index) => {
                const done = index < props.current
                const active = index === props.current
                return (
                    <div key={label} className="flex items-center gap-2">
                        <div
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                                done
                                    ? 'bg-[var(--accent)] text-white'
                                    : active
                                      ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                                      : 'border border-[var(--border-secondary)] text-[var(--text-secondary)]'
                            }`}
                        >
                            {done ? '✓' : index + 1}
                        </div>
                        <span
                            className={`text-xs ${
                                active ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                            }`}
                        >
                            {label}
                        </span>
                        {index < STEP_LABELS.length - 1 ? (
                            <div className="h-px w-6 bg-[var(--border-tertiary)]" />
                        ) : null}
                    </div>
                )
            })}
        </div>
    )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function CloudOnboardPage() {
    const [step, setStep] = useState(0)

    function next() {
        setStep((s) => Math.min(s + 1, 4))
    }

    return (
        <div className="mx-auto w-full max-w-content px-4 py-8">
            <div className="mx-auto max-w-2xl">
                <CursorSettingsHeader
                    title="Get started with cloud agents"
                    description="Follow these steps to set up your first cloud agent workspace."
                />

                <div className="mb-8 overflow-x-auto">
                    <StepIndicator current={step} />
                </div>

                <CursorSettingsSection>
                    <CursorSettingsCard className="p-6">
                    {step === 0 ? <StepAddWorker onNext={next} /> : null}
                    {step === 1 ? <StepPrepareRuntime onNext={next} /> : null}
                    {step === 2 ? <StepSetupEnvironment onNext={next} /> : null}
                    {step === 3 ? <StepSaveCheckpoint onNext={next} /> : null}
                    {step === 4 ? <StepSecrets /> : null}
                    </CursorSettingsCard>
                </CursorSettingsSection>
            </div>
        </div>
    )
}
