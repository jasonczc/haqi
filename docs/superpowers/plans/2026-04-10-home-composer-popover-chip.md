# HomeComposer Popover-Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken HomeComposer with a fully functional Cursor-style composer that exposes all 25+ session creation settings via custom Popover chips.

**Architecture:** A single `HomeComposer` function in `router.tsx` renders the prompt card with 3 `<button className="tool-chip">` elements in the footer. Each chip toggles a `<ChipPopover>` portal component anchored below it. A repo-selector panel above the card handles repo/branch/workspace. All state is local `useState` hooks; spawn uses the existing `useSpawnSession` mutation.

**Tech Stack:** React 19, CSS classes from `cursor-theme-v2.css`, portal-based Popover, existing hooks (`useMachines`, `useCloudWorkers`, `useCloudEnvironments`, `useCloudCheckpoints`, `useSpawnSession`), existing preference utilities from `NewSession/preferences.ts`.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `web/src/components/ChipPopover.tsx` | **New.** Reusable portal popover: positioning, click-outside, Escape close |
| `web/src/styles/cursor-theme-v2.css` | **Modify.** Add `.chip-popover` and `.chip-popover-group` styles |
| `web/src/components/HomeComposer.tsx` | **New.** Extract HomeComposer from router.tsx into its own file |
| `web/src/router.tsx` | **Modify.** Import `HomeComposer` from new file, remove inline function |

---

### Task 1: ChipPopover Component

**Files:**
- Create: `web/src/components/ChipPopover.tsx`

- [ ] **Step 1: Create ChipPopover component**

```tsx
// web/src/components/ChipPopover.tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ChipPopoverProps = {
    open: boolean
    onClose: () => void
    anchorRef: React.RefObject<HTMLButtonElement | null>
    children: ReactNode
    width?: number
}

export function ChipPopover({ open, onClose, anchorRef, children, width = 280 }: ChipPopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    useEffect(() => {
        if (!open || !anchorRef.current) return
        const rect = anchorRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        let left = rect.left
        if (left + width > viewportWidth - 8) {
            left = viewportWidth - width - 8
        }
        setPos({ top: rect.bottom + 6, left: Math.max(8, left) })
    }, [open, anchorRef, width])

    useEffect(() => {
        if (!open) return
        const handleClick = (e: MouseEvent) => {
            if (popoverRef.current?.contains(e.target as Node)) return
            if (anchorRef.current?.contains(e.target as Node)) return
            onClose()
        }
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('pointerdown', handleClick)
        document.addEventListener('keydown', handleKey)
        return () => {
            document.removeEventListener('pointerdown', handleClick)
            document.removeEventListener('keydown', handleKey)
        }
    }, [open, onClose, anchorRef])

    if (!open || !pos) return null

    return createPortal(
        <div
            ref={popoverRef}
            className="chip-popover"
            style={{ top: pos.top, left: pos.left, width }}
        >
            {children}
        </div>,
        document.body
    )
}

export function PopoverGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="chip-popover-group">
            <div className="chip-popover-label">{label}</div>
            {children}
        </div>
    )
}

export function PopoverRow({
    label, children, description
}: {
    label: string
    children: ReactNode
    description?: string
}) {
    return (
        <div className="chip-popover-row">
            <div className="chip-popover-row-left">
                <span className="chip-popover-row-label">{label}</span>
                {description ? <span className="chip-popover-row-desc">{description}</span> : null}
            </div>
            <div className="chip-popover-row-right">{children}</div>
        </div>
    )
}

export function PopoverOption({
    selected, onClick, children
}: {
    selected: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            type="button"
            className={`chip-popover-option ${selected ? 'selected' : ''}`}
            onClick={onClick}
        >
            {children}
            {selected ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : null}
        </button>
    )
}

export function PopoverPillRow({
    options, value, onChange
}: {
    options: { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="chip-popover-pills">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    className={`chip-popover-pill ${o.value === value ? 'active' : ''}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd web && npx tsc --noEmit 2>&1 | grep ChipPopover`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ChipPopover.tsx
git commit -m "feat(web): add ChipPopover reusable component"
```

---

### Task 2: ChipPopover CSS

**Files:**
- Modify: `web/src/styles/cursor-theme-v2.css` (append before the Bridge section)

- [ ] **Step 1: Add chip-popover styles**

Append these styles to `cursor-theme-v2.css` before the `/* Bridge */` comment block:

```css
/* ============================================================
   Chip Popover (floating panels for tool-chips)
   ============================================================ */
.chip-popover {
    position: fixed;
    z-index: 100;
    background: var(--cursor-bg-card);
    border: 1px solid var(--cursor-stroke-secondary);
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    padding: 8px 0;
    max-height: 420px;
    overflow-y: auto;
    animation: chip-popover-in 0.12s ease-out;
}

@keyframes chip-popover-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
}

.chip-popover::-webkit-scrollbar { width: 4px; }
.chip-popover::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
}

.chip-popover-group {
    padding: 4px 0;
}

.chip-popover-group + .chip-popover-group {
    border-top: 1px solid var(--cursor-stroke-tertiary);
}

.chip-popover-label {
    padding: 4px 14px 2px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cursor-text-tertiary);
}

.chip-popover-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    gap: 8px;
}

.chip-popover-row-left {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.chip-popover-row-label {
    font-size: 13px;
    color: var(--cursor-text-primary);
}

.chip-popover-row-desc {
    font-size: 11px;
    color: var(--cursor-text-tertiary);
}

.chip-popover-row-right {
    flex-shrink: 0;
}

.chip-popover-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 7px 14px;
    background: none;
    border: none;
    font-size: 13px;
    color: var(--cursor-text-primary);
    cursor: pointer;
    transition: background 0.1s;
    text-align: left;
}

.chip-popover-option:hover {
    background: var(--cursor-bg-hover);
}

.chip-popover-option.selected {
    font-weight: 500;
}

.chip-popover-option svg {
    color: var(--cursor-success, #16a34a);
    flex-shrink: 0;
}

.chip-popover-pills {
    display: flex;
    gap: 4px;
    padding: 4px 14px;
    flex-wrap: wrap;
}

.chip-popover-pill {
    padding: 3px 10px;
    border-radius: 9999px;
    border: 1px solid var(--cursor-stroke-secondary);
    background: transparent;
    font-size: 12px;
    color: var(--cursor-text-secondary);
    cursor: pointer;
    transition: all 0.1s;
}

.chip-popover-pill:hover {
    border-color: var(--cursor-stroke-primary);
    color: var(--cursor-text-primary);
}

.chip-popover-pill.active {
    background: var(--cursor-text-primary);
    border-color: var(--cursor-text-primary);
    color: var(--cursor-bg-card);
}

.chip-popover-input {
    width: 100%;
    padding: 5px 10px;
    border: 1px solid var(--cursor-stroke-secondary);
    border-radius: 6px;
    font-size: 12px;
    background: var(--cursor-bg-card);
    color: var(--cursor-text-primary);
    outline: none;
}

.chip-popover-input:focus {
    border-color: var(--cursor-stroke-primary);
}

.chip-popover-input::placeholder {
    color: var(--cursor-text-tertiary);
}

.chip-popover-toggle {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 18px;
    cursor: pointer;
}

.chip-popover-toggle input {
    opacity: 0; width: 0; height: 0;
}

.chip-popover-toggle-track {
    position: absolute;
    inset: 0;
    border-radius: 9px;
    background: var(--cursor-stroke-secondary);
    transition: background 0.15s;
}

.chip-popover-toggle input:checked + .chip-popover-toggle-track {
    background: var(--cursor-success, #16a34a);
}

.chip-popover-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    transition: transform 0.15s;
}

.chip-popover-toggle input:checked ~ .chip-popover-toggle-thumb {
    transform: translateX(14px);
}
```

- [ ] **Step 2: Verify CSS loads**

Run: `curl -s http://localhost:5173/src/styles/cursor-theme-v2.css | grep -c 'chip-popover'`
Expected: count > 0

- [ ] **Step 3: Commit**

```bash
git add web/src/styles/cursor-theme-v2.css
git commit -m "feat(web): add chip-popover CSS styles"
```

---

### Task 3: Extract HomeComposer to Dedicated File

**Files:**
- Create: `web/src/components/HomeComposer.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Create HomeComposer.tsx with full state and all 4 chip popovers**

This is the largest task. The file contains:
- All 25+ `useState` hooks with localStorage-backed defaults
- The repo-selector expandable panel
- The prompt-card with textarea
- Three tool-chip buttons each toggling a `ChipPopover`
- The submit handler using `useSpawnSession`
- The recent-runs agent-list

Create `web/src/components/HomeComposer.tsx` — see the full implementation below.

The file structure:

```tsx
// web/src/components/HomeComposer.tsx
import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { useCloudWorkers } from '@/hooks/queries/useCloudWorkers'
import { useCloudEnvironments } from '@/hooks/queries/useCloudEnvironments'
import { useCloudCheckpoints } from '@/hooks/queries/useCloudCheckpoints'
import { useMachines } from '@/hooks/queries/useMachines'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { queryKeys } from '@/lib/query-keys'
import { MODEL_OPTIONS, getThinkEffortOptions, CODEX_SERVICE_TIER_OPTIONS } from '@/components/NewSession/types'
import type { AgentType, ThinkEffort, ServiceTier, SessionType } from '@/components/NewSession/types'
import {
    loadPreferredAgent, savePreferredAgent,
    loadPreferredModel, savePreferredModel,
    loadPreferredThinkEffort, savePreferredThinkEffort,
    loadPreferredYoloMode, savePreferredYoloMode,
    loadPreferredSessionType, savePreferredSessionType,
    loadPreferredExecutionBackend, savePreferredExecutionBackend,
    loadPreferredRuntimeKind, savePreferredRuntimeKind,
} from '@/components/NewSession/preferences'
import { resolveSpawnModel, resolveSpawnThinkEffort, resolveSpawnServiceTier } from '@/components/NewSession/spawnPayload'
import { ChipPopover, PopoverGroup, PopoverOption, PopoverPillRow, PopoverRow } from '@/components/ChipPopover'

// ---- Helper: format session row data (copied from router.tsx helpers) ----
// Import these from router.tsx or define locally. For now we accept them as props.

type OpenPopover = 'model' | 'cloud' | 'config' | null

export function HomeComposer(props: {
    api: ApiClient | null
    onOpenSession: (sessionId: string) => void
    sessions: SessionSummary[]
    renderAgentList: () => React.ReactNode  // delegate recent-runs rendering to parent
}) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    // --- Data hooks ---
    const { workers } = useCloudWorkers(props.api, true)
    const { machines } = useMachines(props.api, true)
    const { environments } = useCloudEnvironments(props.api, true)
    const { checkpoints } = useCloudCheckpoints(props.api, true)
    const { spawnSession, isPending: isSpawning } = useSpawnSession(props.api)
    const activeWorker = workers.find(w => w.active && w.selectable)

    // --- Refs ---
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const modelChipRef = useRef<HTMLButtonElement>(null)
    const cloudChipRef = useRef<HTMLButtonElement>(null)
    const configChipRef = useRef<HTMLButtonElement>(null)

    // --- Popover state ---
    const [openPopover, setOpenPopover] = useState<OpenPopover>(null)
    const togglePopover = useCallback((p: OpenPopover) => {
        setOpenPopover(prev => prev === p ? null : p)
    }, [])
    const closePopover = useCallback(() => setOpenPopover(null), [])

    // --- Form state ---
    const [prompt, setPrompt] = useState('')
    const [repoUrl, setRepoUrl] = useState('')
    const [repoBranch, setRepoBranch] = useState('')
    const [showRepoPanel, setShowRepoPanel] = useState(false)
    const [workspaceMode, setWorkspaceMode] = useState<'ephemeral' | 'persistent' | 'snapshot-derived'>('ephemeral')
    const [directory, setDirectory] = useState('')

    const [agent, setAgent] = useState<AgentType>(loadPreferredAgent)
    const [model, setModel] = useState(() => loadPreferredModel(loadPreferredAgent()) ?? 'auto')
    const [customModel, setCustomModel] = useState('')
    const [thinkEffort, setThinkEffort] = useState<ThinkEffort>(() => loadPreferredThinkEffort(loadPreferredAgent()) ?? 'high')
    const [serviceTier, setServiceTier] = useState<ServiceTier>('auto')

    const [executionBackend, setExecutionBackend] = useState(() => loadPreferredExecutionBackend() ?? (activeWorker ? 'cloud-self-hosted' : 'local'))
    const [runtimeKind, setRuntimeKind] = useState(() => loadPreferredRuntimeKind() ?? 'host-process')
    const [launchMode, setLaunchMode] = useState<'interactive' | 'background'>('interactive')
    const [machineId, setMachineId] = useState('auto')
    const [environmentId, setEnvironmentId] = useState('')
    const [checkpointId, setCheckpointId] = useState('')

    const [sessionType, setSessionType] = useState<SessionType>(() => loadPreferredSessionType())
    const [worktreeName, setWorktreeName] = useState('')
    const [yolo, setYolo] = useState(() => loadPreferredYoloMode())
    const [networkPolicy, setNetworkPolicy] = useState('default')
    const [ttlMinutes, setTtlMinutes] = useState('')
    const [labels, setLabels] = useState('')
    const [secrets, setSecrets] = useState('')
    const [previewUrl, setPreviewUrl] = useState('')
    const [previewAutoDetect, setPreviewAutoDetect] = useState(true)
    const [previewPreferredPort, setPreviewPreferredPort] = useState('')

    const [spawnError, setSpawnError] = useState<string | null>(null)

    // --- Derived ---
    const isCloud = executionBackend === 'cloud-self-hosted' || executionBackend === 'cloud-managed'
    const modelOptions = MODEL_OPTIONS[agent] ?? []
    const modelLabel = modelOptions.find(o => o.value === model)?.label ?? model
    const effortLabel = getThinkEffortOptions(agent).find(o => o.value === thinkEffort)?.label ?? ''

    // --- Submit ---
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim() || isSpawning) return
        setSpawnError(null)

        const resolvedMachineId = isCloud ? (machineId || 'auto') : machines[0]?.id
        if (!resolvedMachineId) {
            setSpawnError('No machine available')
            return
        }

        try {
            const result = await spawnSession({
                machineId: resolvedMachineId,
                agent,
                model: resolveSpawnModel(agent, model, customModel),
                thinkEffort: resolveSpawnThinkEffort(agent, thinkEffort),
                serviceTier: resolveSpawnServiceTier(agent, serviceTier),
                sessionType,
                worktreeName: sessionType === 'worktree' ? worktreeName : undefined,
                executionBackend: isCloud ? executionBackend : undefined,
                runtimeKind: isCloud ? runtimeKind : undefined,
                launchMode: isCloud ? launchMode : undefined,
                environmentId: environmentId || undefined,
                checkpointId: checkpointId || undefined,
                yolo,
                initialPrompt: prompt.trim(),
                directory: !isCloud && directory ? directory : undefined,
                workspaceSource: repoUrl.trim() ? { repository: { url: repoUrl.trim() } } : undefined,
                workspace: (repoBranch || workspaceMode !== 'ephemeral') ? {
                    branch: repoBranch || undefined,
                    mode: workspaceMode,
                } : undefined,
                networkPolicy: networkPolicy !== 'default' ? networkPolicy as any : undefined,
                ttlMinutes: ttlMinutes ? Number(ttlMinutes) : undefined,
                labels: labels.trim() ? labels.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                secrets: secrets.trim() ? secrets.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                previewUrl: previewUrl || undefined,
                preview: (previewAutoDetect !== true || previewPreferredPort) ? {
                    autoDetect: previewAutoDetect,
                    preferredPort: previewPreferredPort ? Number(previewPreferredPort) : undefined,
                } : undefined,
            })

            // Save preferences
            savePreferredAgent(agent)
            savePreferredModel(agent, model)
            savePreferredThinkEffort(agent, thinkEffort)
            savePreferredYoloMode(yolo)
            savePreferredSessionType(sessionType)
            if (isCloud) {
                savePreferredExecutionBackend(executionBackend as any)
                savePreferredRuntimeKind(runtimeKind as any)
            }

            if (result.type === 'success' && result.sessionId) {
                setPrompt('')
                void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
                props.onOpenSession(result.sessionId)
            } else if (result.type === 'accepted') {
                setPrompt('')
                void queryClient.invalidateQueries({ queryKey: queryKeys.cloudRequests })
                navigate({ to: '/settings/requests/$requestId', params: { requestId: result.requestId } })
            } else if (result.type === 'error') {
                setSpawnError((result as any).message ?? 'Spawn failed')
            }
        } catch (err: any) {
            setSpawnError(err?.message ?? 'Spawn failed')
        }
    }, [prompt, repoUrl, repoBranch, workspaceMode, directory, agent, model, customModel, thinkEffort, serviceTier, executionBackend, runtimeKind, launchMode, machineId, environmentId, checkpointId, sessionType, worktreeName, yolo, networkPolicy, ttlMinutes, labels, secrets, previewUrl, previewAutoDetect, previewPreferredPort, isCloud, machines, isSpawning, spawnSession, props, navigate, queryClient])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
        }
    }, [handleSubmit])

    const repoDisplayName = repoUrl.trim()
        ? repoUrl.replace(/^https?:\/\/(github\.com\/)?/, '').replace(/\.git$/, '')
        : null

    // --- Chip display text ---
    const modelChipText = `${agent === 'claude' ? 'Claude' : agent === 'codex' ? 'Codex' : agent} ${modelLabel}${effortLabel ? ` ${effortLabel}` : ''}`
    const cloudChipText = isCloud ? 'Cloud' : 'Local'

    // --- Render ---
    return (
        <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 sm:px-8">
            <div className="content-wrapper w-full max-w-[800px] pt-[12vh]">
                <div className="home-hero">
                    <div className="home-eyebrow">New agent</div>

                    {/* ---- Repo selector ---- */}
                    <div className="repo-selector">
                        {showRepoPanel ? (
                            <div className="prompt-card" style={{ padding: '12px 14px', marginBottom: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <input
                                    type="text"
                                    placeholder="https://github.com/owner/repo"
                                    value={repoUrl}
                                    onChange={e => setRepoUrl(e.target.value)}
                                    autoFocus
                                    className="chip-popover-input"
                                />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="text"
                                        placeholder="Branch (optional)"
                                        value={repoBranch}
                                        onChange={e => setRepoBranch(e.target.value)}
                                        className="chip-popover-input"
                                        style={{ flex: 1 }}
                                    />
                                    {!isCloud ? (
                                        <input
                                            type="text"
                                            placeholder="Directory"
                                            value={directory}
                                            onChange={e => setDirectory(e.target.value)}
                                            className="chip-popover-input"
                                            style={{ flex: 1 }}
                                        />
                                    ) : null}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <PopoverPillRow
                                        options={[
                                            { value: 'ephemeral', label: 'Ephemeral' },
                                            { value: 'persistent', label: 'Persistent' },
                                            { value: 'snapshot-derived', label: 'Snapshot' },
                                        ]}
                                        value={workspaceMode}
                                        onChange={v => setWorkspaceMode(v as any)}
                                    />
                                    <button type="button" className="pill-btn" onClick={() => { setShowRepoPanel(false); textareaRef.current?.focus() }}>Done</button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" className="repo-btn" onClick={() => setShowRepoPanel(true)}>
                                {repoDisplayName ?? 'Select repository'}
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                        )}
                    </div>

                    {/* ---- Prompt card ---- */}
                    <div className="prompt-container">
                        <div className="prompt-card">
                            <textarea
                                ref={textareaRef}
                                placeholder="Ask Cursor to build, fix bugs, explore"
                                rows={4}
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="prompt-input"
                                disabled={isSpawning}
                            />
                            <div className="prompt-footer">
                                <div className="prompt-tools">
                                    {/* Model chip */}
                                    <button ref={modelChipRef} type="button" className="tool-chip" onClick={() => togglePopover('model')}>
                                        {modelChipText}
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                    {/* Cloud chip */}
                                    <button ref={cloudChipRef} type="button" className="tool-chip" onClick={() => togglePopover('cloud')}>
                                        {cloudChipText}
                                        {isCloud && activeWorker ? (
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                                        ) : null}
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                    {/* Config chip */}
                                    <button ref={configChipRef} type="button" className="tool-chip" onClick={() => togglePopover('config')}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                </div>
                                <div className="prompt-actions">
                                    <button
                                        className={`action-btn ${prompt.trim() ? 'active' : ''}`}
                                        type="button"
                                        aria-label="Start agent"
                                        onClick={handleSubmit}
                                        disabled={isSpawning || !prompt.trim()}
                                    >
                                        {isSpawning ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {spawnError ? (
                        <div style={{ color: 'var(--cursor-danger, #dc2626)', fontSize: 13, marginTop: 8 }}>{spawnError}</div>
                    ) : null}

                    {/* ---- Suggestion pills ---- */}
                    <div className="action-pills">
                        <button className="pill-btn" type="button" onClick={() => { setPrompt('Run security audit'); textareaRef.current?.focus() }}>Run security audit</button>
                        <button className="pill-btn" type="button" onClick={() => { setPrompt('Improve AGENTS.md'); textareaRef.current?.focus() }}>Improve AGENTS.md</button>
                        <button className="pill-btn" type="button" onClick={() => { setPrompt('Solve a TODO'); textareaRef.current?.focus() }}>Solve a TODO</button>
                    </div>
                </div>

                {/* ---- Recent runs ---- */}
                {props.renderAgentList()}

                {/* ======== POPOVERS (portals, rendered last) ======== */}

                {/* Model Popover */}
                <ChipPopover open={openPopover === 'model'} onClose={closePopover} anchorRef={modelChipRef} width={260}>
                    <PopoverGroup label="Agent">
                        {(['claude', 'codex', 'cursor', 'gemini', 'opencode'] as AgentType[]).map(a => (
                            <PopoverOption key={a} selected={agent === a} onClick={() => { setAgent(a); setModel('auto'); setThinkEffort(getThinkEffortOptions(a)[0]?.value ?? 'auto') }}>
                                {a.charAt(0).toUpperCase() + a.slice(1)}
                            </PopoverOption>
                        ))}
                    </PopoverGroup>
                    <PopoverGroup label="Model">
                        {modelOptions.map(o => (
                            <PopoverOption key={o.value} selected={model === o.value} onClick={() => setModel(o.value)}>
                                {o.label}
                            </PopoverOption>
                        ))}
                    </PopoverGroup>
                    {getThinkEffortOptions(agent).length > 0 ? (
                        <PopoverGroup label="Think Effort">
                            <PopoverPillRow
                                options={getThinkEffortOptions(agent)}
                                value={thinkEffort}
                                onChange={v => setThinkEffort(v as ThinkEffort)}
                            />
                        </PopoverGroup>
                    ) : null}
                    {agent === 'codex' ? (
                        <PopoverGroup label="Service Tier">
                            <PopoverPillRow
                                options={CODEX_SERVICE_TIER_OPTIONS}
                                value={serviceTier}
                                onChange={v => setServiceTier(v as ServiceTier)}
                            />
                        </PopoverGroup>
                    ) : null}
                </ChipPopover>

                {/* Cloud Popover */}
                <ChipPopover open={openPopover === 'cloud'} onClose={closePopover} anchorRef={cloudChipRef} width={300}>
                    <PopoverGroup label="Execution">
                        <PopoverPillRow
                            options={[
                                { value: 'local', label: 'Local' },
                                { value: 'cloud-self-hosted', label: 'Self-hosted' },
                                { value: 'cloud-managed', label: 'Managed' },
                            ]}
                            value={executionBackend}
                            onChange={v => setExecutionBackend(v as any)}
                        />
                    </PopoverGroup>
                    {isCloud ? (
                        <>
                            <PopoverGroup label="Machine">
                                <PopoverOption selected={machineId === 'auto'} onClick={() => setMachineId('auto')}>
                                    Auto
                                </PopoverOption>
                                {workers.map(w => (
                                    <PopoverOption key={w.machineId} selected={machineId === w.machineId} onClick={() => setMachineId(w.machineId)}>
                                        {w.machineId.slice(0, 30)}{w.active ? ' ●' : ''}
                                    </PopoverOption>
                                ))}
                            </PopoverGroup>
                            <PopoverGroup label="Runtime">
                                <PopoverPillRow
                                    options={[
                                        { value: 'host-process', label: 'Host' },
                                        { value: 'docker-session', label: 'Docker' },
                                        { value: 'daemon-session', label: 'Daemon' },
                                    ]}
                                    value={runtimeKind}
                                    onChange={v => setRuntimeKind(v as any)}
                                />
                            </PopoverGroup>
                            {environments.length > 0 ? (
                                <PopoverGroup label="Environment">
                                    <PopoverOption selected={!environmentId} onClick={() => setEnvironmentId('')}>None</PopoverOption>
                                    {environments.map(env => (
                                        <PopoverOption key={env.id} selected={environmentId === env.id} onClick={() => setEnvironmentId(env.id)}>
                                            {env.id}
                                        </PopoverOption>
                                    ))}
                                </PopoverGroup>
                            ) : null}
                            {checkpoints.length > 0 ? (
                                <PopoverGroup label="Checkpoint">
                                    <PopoverOption selected={!checkpointId} onClick={() => setCheckpointId('')}>None</PopoverOption>
                                    {checkpoints.map(cp => (
                                        <PopoverOption key={cp.id} selected={checkpointId === cp.id} onClick={() => setCheckpointId(cp.id)}>
                                            {cp.name || cp.id.slice(0, 20)}
                                        </PopoverOption>
                                    ))}
                                </PopoverGroup>
                            ) : null}
                            <PopoverGroup label="Launch">
                                <PopoverPillRow
                                    options={[
                                        { value: 'interactive', label: 'Interactive' },
                                        { value: 'background', label: 'Background' },
                                    ]}
                                    value={launchMode}
                                    onChange={v => setLaunchMode(v as any)}
                                />
                            </PopoverGroup>
                        </>
                    ) : (
                        <PopoverGroup label="Machine">
                            {machines.length > 0 ? machines.map(m => (
                                <PopoverOption key={m.id} selected={machineId === m.id} onClick={() => setMachineId(m.id)}>
                                    {m.id.slice(0, 30)}{m.active ? ' ●' : ''}
                                </PopoverOption>
                            )) : (
                                <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--cursor-text-tertiary)' }}>No machines connected</div>
                            )}
                        </PopoverGroup>
                    )}
                </ChipPopover>

                {/* Config Popover */}
                <ChipPopover open={openPopover === 'config'} onClose={closePopover} anchorRef={configChipRef} width={300}>
                    <PopoverGroup label="Session">
                        <PopoverPillRow
                            options={[
                                { value: 'simple', label: 'Simple' },
                                { value: 'worktree', label: 'Worktree' },
                                { value: 'setup', label: 'Setup' },
                            ]}
                            value={sessionType}
                            onChange={v => setSessionType(v as SessionType)}
                        />
                        {sessionType === 'worktree' ? (
                            <div style={{ padding: '4px 14px' }}>
                                <input className="chip-popover-input" placeholder="Worktree name" value={worktreeName} onChange={e => setWorktreeName(e.target.value)} />
                            </div>
                        ) : null}
                    </PopoverGroup>
                    <PopoverGroup label="Permissions">
                        <PopoverRow label="YOLO mode" description="Auto-approve all tool calls">
                            <label className="chip-popover-toggle">
                                <input type="checkbox" checked={yolo} onChange={e => setYolo(e.target.checked)} />
                                <span className="chip-popover-toggle-track" />
                                <span className="chip-popover-toggle-thumb" />
                            </label>
                        </PopoverRow>
                    </PopoverGroup>
                    <PopoverGroup label="Network">
                        <PopoverPillRow
                            options={[
                                { value: 'default', label: 'Default' },
                                { value: 'restricted', label: 'Restricted' },
                                { value: 'off', label: 'Off' },
                            ]}
                            value={networkPolicy}
                            onChange={setNetworkPolicy}
                        />
                    </PopoverGroup>
                    <PopoverGroup label="Lifetime">
                        <div style={{ padding: '4px 14px' }}>
                            <input className="chip-popover-input" type="number" placeholder="TTL minutes (blank = unlimited)" value={ttlMinutes} onChange={e => setTtlMinutes(e.target.value)} />
                        </div>
                    </PopoverGroup>
                    <PopoverGroup label="Metadata">
                        <div style={{ padding: '4px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <input className="chip-popover-input" placeholder="Labels (comma-separated)" value={labels} onChange={e => setLabels(e.target.value)} />
                            <input className="chip-popover-input" placeholder="Secrets (comma-separated)" value={secrets} onChange={e => setSecrets(e.target.value)} />
                        </div>
                    </PopoverGroup>
                    <PopoverGroup label="Preview">
                        <div style={{ padding: '4px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <input className="chip-popover-input" placeholder="Preview URL" value={previewUrl} onChange={e => setPreviewUrl(e.target.value)} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PopoverRow label="Auto-detect" description="">
                                    <label className="chip-popover-toggle">
                                        <input type="checkbox" checked={previewAutoDetect} onChange={e => setPreviewAutoDetect(e.target.checked)} />
                                        <span className="chip-popover-toggle-track" />
                                        <span className="chip-popover-toggle-thumb" />
                                    </label>
                                </PopoverRow>
                            </div>
                            <input className="chip-popover-input" type="number" placeholder="Preferred port" value={previewPreferredPort} onChange={e => setPreviewPreferredPort(e.target.value)} />
                        </div>
                    </PopoverGroup>
                </ChipPopover>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd web && bun run typecheck 2>&1 | tail -5`
Expected: no errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add web/src/components/HomeComposer.tsx
git commit -m "feat(web): add HomeComposer with Popover-Chip architecture"
```

---

### Task 4: Wire HomeComposer into Router

**Files:**
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Replace inline HomeComposer with imported component**

In `router.tsx`:

1. Add import at top:
```tsx
import { HomeComposer } from '@/components/HomeComposer'
```

2. Delete the entire inline `function HomeComposer(...)` (lines ~392-620).

3. Update the render site (currently line ~820) to pass `renderAgentList`:
```tsx
<HomeComposer
    api={api}
    onOpenSession={selectSession}
    sessions={visibleSessions}
    renderAgentList={() => (
        <>
            <div className="home-section-header">
                <div className="home-section-title">Recent runs</div>
                <div className="home-section-meta">{Math.min(visibleSessions.length, 8)} visible</div>
            </div>
            <div className="agent-list mt-2 w-full">
                {visibleSessions.slice(0, 8).map(s => {
                    // ... existing agent-row rendering code stays here
                })}
            </div>
        </>
    )}
/>
```

The agent-row rendering code (~lines 456-496 in current file) should be kept inline in the render prop since it uses helper functions (`getSessionDisplayTitle`, `formatHomeTime`, `getSessionHistoryState`, `SessionStatusIcon`) that are defined in `router.tsx`.

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web && bun run typecheck 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 3: Verify page loads in browser**

Open `http://localhost:5173/sessions` — should see the composer with clickable tool-chips in the footer.

- [ ] **Step 4: Commit**

```bash
git add web/src/router.tsx
git commit -m "refactor(web): wire HomeComposer component into router"
```

---

### Task 5: Verify End-to-End

- [ ] **Step 1: Visual verification**

Open `http://localhost:5173/sessions`. Verify:
- Repo-btn shows "Select repository" with chevron, matches reference styling
- Prompt card has white bg, subtle border, shadow — matches `cursor-clone/index.html`
- Footer has 3 tool-chips + 1 action-btn on the right
- Pills below card match reference styling

- [ ] **Step 2: Interaction verification**

Click each tool-chip:
- Model chip → popover opens below, shows Agent list, Model list, Effort pills
- Cloud chip → popover opens, shows Execution pills, Machine list, Runtime pills
- Config chip → popover opens, shows Session type, YOLO toggle, Network, TTL, etc.
- Click outside → popover closes
- Press Escape → popover closes
- Only one popover open at a time

- [ ] **Step 3: Spawn verification**

1. Type a prompt in textarea
2. Click the submit (▶) button or press Cmd+Enter
3. Verify the session is created (or accepted with request ID)
4. Verify navigation to session chat or request tracking page

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(web): polish HomeComposer popover interactions"
```
