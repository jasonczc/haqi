import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
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
        if (!autoAdvanced.current && (workersQuery.data?.workers?.length ?? 0) > 0) {
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
                <h2 className="text-base font-semibold text-[var(--cursor-text-primary)]">Step 1: Add a Worker</h2>
                <p className="mt-1 text-sm text-[var(--cursor-text-secondary)]">
                    A worker runs on your machine and executes cloud agent tasks.
                    This page will automatically advance once a worker comes online.
                </p>
            </div>

            <div className="rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-quiet)] p-4">
                <div className="text-sm font-medium text-[var(--cursor-text-primary)]">Quick Start</div>
                <p className="mt-1 text-xs text-[var(--cursor-text-secondary)]">
                    Start a worker process directly on this machine with one click.
                </p>
                <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleStartLocal()}
                    disabled={startingLocal}
                >
                    {startingLocal ? 'Starting...' : 'Start Worker on This Machine'}
                </Button>
                {localStartError ? (
                    <div className="mt-1 text-xs text-[var(--cursor-badge-error-text)]">{localStartError}</div>
                ) : null}
            </div>

            <div className="text-xs text-[var(--cursor-text-secondary)]">Or generate a token to connect a remote worker:</div>

            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[14rem] flex-1">
                    <label className="mb-1 block text-xs font-medium text-[var(--cursor-text-secondary)]">
                        Label (optional)
                    </label>
                    <input
                        type="text"
                        placeholder="e.g. gpu-worker-1"
                        value={tokenLabel}
                        onChange={(e) => setTokenLabel(e.target.value)}
                        className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    />
                </div>
                <div className="w-28">
                    <label className="mb-1 block text-xs font-medium text-[var(--cursor-text-secondary)]">
                        TTL (min)
                    </label>
                    <input
                        type="number"
                        min={1}
                        value={tokenTtl}
                        onChange={(e) => setTokenTtl(e.target.value)}
                        className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    />
                </div>
                <Button
                    type="button"
                    size="sm"
                    onClick={() => tokenMutation.mutate()}
                    disabled={tokenMutation.isPending}
                >
                    {tokenMutation.isPending ? 'Generating...' : 'Generate Token'}
                </Button>
            </div>

            {tokenMutation.error instanceof Error ? (
                <div className="text-sm text-[var(--cursor-badge-error-text)]">{tokenMutation.error.message}</div>
            ) : null}

            {generatedToken ? (
                <div className="rounded-md border border-[var(--cursor-badge-success-border)] bg-[var(--cursor-badge-success-bg)] p-3">
                    <div className="text-sm font-medium text-[var(--cursor-badge-success-text)]">
                        Token generated — copy it now, it will not be shown again.
                    </div>
                    <div className="mt-2 flex items-start gap-2">
                        <code className="flex-1 break-all rounded bg-black/5 px-2 py-1 font-mono text-xs">
                            {generatedToken}
                        </code>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(generatedToken)}
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                    </div>
                    <div className="mt-3">
                        <div className="text-xs font-medium text-[var(--cursor-text-secondary)]">Install command:</div>
                        <div className="mt-1 flex items-start gap-2">
                            <code className="flex-1 break-all rounded bg-black/5 px-2 py-1 font-mono text-xs">
                                {installCommand}
                            </code>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopy(installCommand)}
                            >
                                Copy
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {workersQuery.data?.workers?.length ? (
                <div className="text-sm text-[var(--cursor-badge-success-text)]">
                    Worker connected — advancing…
                </div>
            ) : generatedToken ? (
                <div className="text-xs text-[var(--cursor-text-secondary)]">
                    Waiting for worker to come online…
                </div>
            ) : null}

            <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={props.onNext}>
                    Skip
                </Button>
            </div>
        </div>
    )
}

// ── Step 2: Setup Environment ───────────────────────────────────────────────

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
    const firstWorker = workers[0]

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
                <h2 className="text-base font-semibold text-[var(--cursor-text-primary)]">Step 2: Setup Environment</h2>
                <p className="mt-1 text-sm text-[var(--cursor-text-secondary)]">
                    Provide a repository URL and choose an agent. The agent will clone the repo and set up your workspace.
                    You'll be taken to the session to watch the agent configure your environment.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--cursor-text-secondary)]">
                        Repository URL (optional)
                    </label>
                    <input
                        type="url"
                        placeholder="https://github.com/org/repo"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--cursor-text-secondary)]">
                        Agent
                    </label>
                    <select
                        value={agent}
                        onChange={(e) => setAgent(e.target.value as AgentFlavor)}
                        className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    >
                        {AGENT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {!firstWorker ? (
                <div className="text-sm text-[var(--cursor-text-secondary)]">
                    No workers found. You can skip this step and set up your environment manually later.
                </div>
            ) : null}

            {error ? (
                <div className="text-sm text-[var(--cursor-badge-error-text)]">{error}</div>
            ) : null}

            <div className="flex items-center justify-between">
                <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleStartSetup()}
                    disabled={isPending || !firstWorker}
                >
                    {isPending ? 'Starting...' : 'Start Setup'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={props.onNext}>
                    Skip
                </Button>
            </div>
        </div>
    )
}

// ── Step 3: Save Checkpoint ─────────────────────────────────────────────────

function StepSaveCheckpoint(props: { onNext: () => void }) {
    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-base font-semibold text-[var(--cursor-text-primary)]">Step 3: Save a Checkpoint</h2>
                <p className="mt-1 text-sm text-[var(--cursor-text-secondary)]">
                    Once the setup session finishes, save a checkpoint of your configured environment.
                    Checkpoints let you spawn new agents from the same starting state instantly.
                </p>
            </div>

            <div className="rounded-md border border-[var(--cursor-badge-info-border)] bg-[var(--cursor-badge-info-bg)] px-4 py-3 text-sm text-[var(--cursor-badge-info-text)]">
                In the session view, click the <strong>Save Checkpoint</strong> button after the agent finishes setting up.
                Then come back here and click the button below.
            </div>

            <div className="flex items-center justify-between">
                <Button type="button" size="sm" onClick={props.onNext}>
                    I've saved a checkpoint
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={props.onNext}>
                    Skip
                </Button>
            </div>
        </div>
    )
}

// ── Step 4: Secrets ─────────────────────────────────────────────────────────

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
                <h2 className="text-base font-semibold text-[var(--cursor-text-primary)]">Step 4: Add Secrets</h2>
                <p className="mt-1 text-sm text-[var(--cursor-text-secondary)]">
                    Add credentials that your cloud agents will use. These are stored securely on the hub.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--cursor-text-secondary)]">
                        GITHUB_TOKEN <span className="text-[var(--cursor-badge-error-text)]">*</span>
                    </label>
                    <input
                        type="password"
                        placeholder="ghp_..."
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        className="w-full rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                    />
                    <p className="mt-1 text-xs text-[var(--cursor-text-secondary)]">
                        Required. Used by agents to clone repos and create pull requests.
                        Create one at{' '}
                        <a
                            href="https://github.com/settings/tokens"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:no-underline"
                        >
                            github.com/settings/tokens
                        </a>
                        .
                    </p>
                </div>

                <div>
                    <div className="mb-2 text-xs font-medium text-[var(--cursor-text-secondary)]">
                        Additional secrets (optional)
                    </div>
                    {extras.map((extra, index) => (
                        <div key={index} className="mb-2 flex gap-2">
                            <input
                                type="text"
                                placeholder="KEY"
                                value={extra.key}
                                onChange={(e) => updateExtra(index, 'key', e.target.value)}
                                className="w-40 rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                            />
                            <input
                                type="password"
                                placeholder="value"
                                value={extra.value}
                                onChange={(e) => updateExtra(index, 'value', e.target.value)}
                                className="flex-1 rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cursor-link)]"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeExtra(index)}
                            >
                                ×
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addExtra}>
                        + Add secret
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="text-sm text-[var(--cursor-badge-error-text)]">{error}</div>
            ) : null}

            <div className="flex justify-end">
                <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleFinish()}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Finish'}
                </Button>
            </div>
        </div>
    )
}

// ── Step indicator ──────────────────────────────────────────────────────────

const STEP_LABELS = ['Add Worker', 'Setup Environment', 'Save Checkpoint', 'Secrets']

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
                                    ? 'bg-[var(--cursor-link)] text-white'
                                    : active
                                      ? 'border-2 border-[var(--cursor-link)] text-[var(--cursor-link)]'
                                      : 'border border-[var(--cursor-stroke-primary)] text-[var(--cursor-text-secondary)]'
                            }`}
                        >
                            {done ? '✓' : index + 1}
                        </div>
                        <span
                            className={`text-xs ${
                                active ? 'font-medium text-[var(--cursor-text-primary)]' : 'text-[var(--cursor-text-secondary)]'
                            }`}
                        >
                            {label}
                        </span>
                        {index < STEP_LABELS.length - 1 ? (
                            <div className="h-px w-6 bg-[var(--cursor-stroke-secondary)]" />
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
        setStep((s) => Math.min(s + 1, 3))
    }

    return (
        <div className="mx-auto w-full max-w-content px-4 py-8">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8">
                    <h1 className="text-lg font-semibold text-[var(--cursor-text-primary)]">Get started with cloud agents</h1>
                    <p className="mt-1 text-sm text-[var(--cursor-text-secondary)]">
                        Follow these steps to set up your first cloud agent workspace.
                    </p>
                </div>

                <div className="mb-8 overflow-x-auto">
                    <StepIndicator current={step} />
                </div>

                <div className="rounded-lg border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-app)] p-6">
                    {step === 0 ? <StepAddWorker onNext={next} /> : null}
                    {step === 1 ? <StepSetupEnvironment onNext={next} /> : null}
                    {step === 2 ? <StepSaveCheckpoint onNext={next} /> : null}
                    {step === 3 ? <StepSecrets /> : null}
                </div>
            </div>
        </div>
    )
}
