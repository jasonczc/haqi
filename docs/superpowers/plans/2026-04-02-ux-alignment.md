# UX Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align HAQI with Cursor Cloud Agent's core user stories: Quick Spawn dialog, Onboarding wizard, Checkpoint timeline inline, Auto PR via gh CLI, and Telegram /cloud command.

**Architecture:** Quick Spawn is a new dialog component triggered from Cloud sidebar. Onboarding is a multi-step wizard at `/cloud/onboard`. Checkpoint inline uses the existing message system with a special meta type. Auto PR is prompt-level + gh CLI in the Docker image. Telegram extends the existing bot with a `/cloud` command.

**Tech Stack:** React, TanStack Router/Query, Hono, Grammy (Telegram), Docker

---

## File Structure

### New files
- `web/src/components/QuickSpawnDialog.tsx` — simplified spawn dialog
- `web/src/routes/cloud/onboard.tsx` — 4-step onboarding wizard

### Modified files
- `web/src/components/CloudSidebar.tsx` — trigger QuickSpawnDialog + onboarding link
- `web/src/router.tsx` — add onboard route
- `hub/src/sync/syncEngine.ts` — insert checkpoint message on save
- `web/src/components/AssistantChat/CliThread.tsx` or message renderer — render checkpoint card
- `cli/src/cloud/executors/HostProcessExecutor.ts` — append PR instruction to prompt
- `web/src/components/SessionHeader.tsx` — detect + display PR URL
- `Dockerfile.workspace` — install gh CLI
- `hub/src/telegram/` — add /cloud command

---

### Task 1: Quick Spawn Dialog

**Files:**
- Create: `web/src/components/QuickSpawnDialog.tsx`
- Modify: `web/src/components/CloudSidebar.tsx`

- [ ] **Step 1: Create QuickSpawnDialog**

Create `web/src/components/QuickSpawnDialog.tsx`:

```tsx
// A simplified 2-field dialog for spawning cloud sessions
// Props: open, onClose, onSpawned(sessionId)
// Fields: checkpoint selector (dropdown), task (textarea), setup toggle
// Advanced section (collapsed): agent, model, repo URL, worker
// Calls useSpawnSession hook on submit
```

The component should:
- Fetch checkpoints via `useQuery({ queryKey: queryKeys.cloudCheckpoints })` for the dropdown
- Fetch workers via `useQuery({ queryKey: queryKeys.cloudWorkers() })` to auto-select a worker
- Use `useSpawnSession` hook for the actual spawn
- Build spawn payload: `{ machineId: autoWorker.machineId, runtimeKind: 'daemon-session', checkpointId, initialPrompt: task, sessionType: setupChecked ? 'setup' : 'simple', yolo: true, agent: 'claude' }`
- Use `Dialog`/`DialogContent` from `@/components/ui/dialog` (read SessionHeader.tsx for the pattern)
- Use `Button` component for Cancel/Start
- Textarea for task input, select for checkpoint, checkbox for setup mode

- [ ] **Step 2: Wire into CloudSidebar**

In `web/src/components/CloudSidebar.tsx`:
- Import `QuickSpawnDialog`
- Add `const [quickSpawnOpen, setQuickSpawnOpen] = useState(false)`
- Change "+ New Session" button to `onClick={() => setQuickSpawnOpen(true)}`
- Render `<QuickSpawnDialog open={quickSpawnOpen} onClose={() => setQuickSpawnOpen(false)} />` at bottom of component
- On successful spawn, navigate to the session: `navigate({ to: '/sessions/$sessionId', params: { sessionId } })`

- [ ] **Step 3: Typecheck + build**

```bash
bun typecheck && cd web && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/QuickSpawnDialog.tsx web/src/components/CloudSidebar.tsx
git commit -m "feat(web): add Quick Spawn dialog for one-click cloud sessions"
```

---

### Task 2: Onboarding Wizard

**Files:**
- Create: `web/src/routes/cloud/onboard.tsx`
- Modify: `web/src/components/CloudSidebar.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Create onboard page**

Create `web/src/routes/cloud/onboard.tsx` with 4 steps:

**Step 1 (Add Worker):**
- Token generation form (reuse pattern from workers.tsx)
- Shows install command
- Polls `useCloudWorkers` every 3s — auto-advances when a worker appears
- "Skip" button if user already has workers

**Step 2 (Setup Environment):**
- Repo URL input
- Agent selector (default Claude)
- "Start Setup" button → calls spawn API with `sessionType: 'setup'`
- On success → navigates to session page (user watches agent configure)
- "Skip" button

**Step 3 (Save Checkpoint):**
- Info text: "In the session, click the 💾 Save Checkpoint button after the agent finishes"
- "I've saved a checkpoint" button → advances
- "Skip" button

**Step 4 (Secrets):**
- `GITHUB_TOKEN` input (required, with helper text)
- Additional secrets (optional key-value pairs)
- "Finish" button → saves secrets via API, sets `localStorage.setItem('haqi-onboard-complete', 'true')`, navigates to `/cloud/workers`

Use state to track current step. Each step is a function component rendered conditionally.

- [ ] **Step 2: Add route**

In `web/src/router.tsx`, add:
```tsx
import CloudOnboardPage from '@/routes/cloud/onboard'
const cloudOnboardRoute = createRoute({
    getParentRoute: () => cloudLayoutRoute,
    path: 'onboard',
    component: CloudOnboardPage,
})
```
Add to cloud route tree.

- [ ] **Step 3: Show onboarding link in CloudSidebar**

In `CloudSidebar.tsx`, when workers count is 0 and `!localStorage.getItem('haqi-onboard-complete')`:
- Show a banner at top of sidebar: "Get started → Set up your first cloud agent"
- Links to `/cloud/onboard`

- [ ] **Step 4: Typecheck + build + commit**

```bash
bun typecheck && cd web && bun run build
git add web/src/routes/cloud/onboard.tsx web/src/components/CloudSidebar.tsx web/src/router.tsx
git commit -m "feat(web): add onboarding wizard for first-time cloud setup"
```

---

### Task 3: Checkpoint Timeline Inline

**Files:**
- Modify: `hub/src/sync/syncEngine.ts`
- Modify: `web/src/components/AssistantChat/` (message renderer)

- [ ] **Step 1: Insert checkpoint message on save**

In `hub/src/sync/syncEngine.ts`, in the `saveCheckpoint` method, after the success path (`store.checkpoints.updateStatus(checkpointId, 'ready')`), insert a message into the session:

```typescript
// After updateStatus(checkpointId, 'ready'):
void this.sendMessage(sessionId, {
    text: `Checkpoint saved: ${name}`,
    meta: {
        type: 'checkpoint',
        checkpointId,
        checkpointName: name,
        savedAt: Date.now()
    }
}).catch(() => {})
```

- [ ] **Step 2: Render checkpoint card in chat**

In the message rendering component (read `web/src/components/AssistantChat/CliThread.tsx` to find where individual messages/blocks are rendered), add a check for checkpoint messages:

When a message has `meta?.type === 'checkpoint'`, render a special card instead of normal text:

```tsx
<div className="mx-3 my-2 flex items-center gap-3 rounded border border-[var(--app-badge-success-border)] bg-[var(--app-badge-success-bg)] px-3 py-2 text-sm">
    <span>💾</span>
    <div className="flex-1">
        <span className="font-medium">{meta.checkpointName}</span>
        <span className="ml-2 text-xs text-[var(--app-hint)]">{formatTime(meta.savedAt)}</span>
    </div>
    <Button variant="outline" size="sm" onClick={() => navigate to spawn with checkpoint}>
        New Session
    </Button>
</div>
```

Note: The exact rendering location depends on how the chat renders messages. Read the code to find where `ChatBlock` or message content is rendered. The checkpoint card should appear inline in the message flow.

- [ ] **Step 3: Typecheck + commit**

```bash
bun typecheck
git add hub/src/sync/syncEngine.ts web/src/components/AssistantChat/
git commit -m "feat: checkpoint cards inline in session chat timeline"
```

---

### Task 4: Auto PR Instruction + PR URL Detection

**Files:**
- Modify: `hub/src/sync/syncEngine.ts`
- Modify: `web/src/components/SessionHeader.tsx`

- [ ] **Step 1: Append PR instruction to initialPrompt**

In `hub/src/sync/syncEngine.ts`, find the `spawnSession` method where `setupPrompt` is built (around the `pendingInitialPrompts` logic). After the setup prompt or custom prompt, append:

```typescript
// If repo URL is in the request and it's a GitHub repo, append PR instruction
const repoUrl = request.workspaceSource?.repository?.url ?? ''
if (repoUrl.includes('github.com') && promptToSend) {
    promptToSend += '\n\nWhen your task is complete, create a pull request using `gh pr create --fill` and report the PR URL.'
}
```

- [ ] **Step 2: Detect PR URL in SessionHeader**

In `web/src/components/SessionHeader.tsx`:

Add a hook/memo that scans the session's recent messages for GitHub PR URLs:

```typescript
const prUrl = useMemo(() => {
    // messages come from props or could be fetched
    // For simplicity: check session metadata for PR URL
    // or scan agentState for PR URL pattern
    const meta = session.metadata as any
    if (meta?.pullRequestUrl) return meta.pullRequestUrl
    return null
}, [session])
```

If `prUrl` is found, render a badge in the header:
```tsx
{prUrl && (
    <a href={prUrl} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-1 rounded-full bg-[var(--app-badge-success-bg)] px-2 py-0.5 text-xs text-[var(--app-badge-success-text)]">
        PR ↗
    </a>
)}
```

Note: Full message scanning for PR URLs is complex. Start simple: check session metadata. The agent can be instructed to include the PR URL in a metadata update (future improvement). For now, just the prompt instruction + metadata check.

- [ ] **Step 3: Typecheck + commit**

```bash
bun typecheck
git add hub/src/sync/syncEngine.ts web/src/components/SessionHeader.tsx
git commit -m "feat: auto PR creation instruction + PR URL detection in header"
```

---

### Task 5: GitHub CLI in Docker Image

**Files:**
- Modify: `Dockerfile.workspace`

- [ ] **Step 1: Add gh CLI installation**

In `Dockerfile.workspace`, in the runtime stage, add after the desktop packages:

```dockerfile
# GitHub CLI
RUN (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg) \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 2: Commit (don't rebuild yet — rebuild in Task 7)**

```bash
git add Dockerfile.workspace
git commit -m "feat: install GitHub CLI (gh) in workspace image"
```

---

### Task 6: Telegram /cloud Command

**Files:**
- Modify: `hub/src/telegram/` (find the bot command registration file)

- [ ] **Step 1: Find where Telegram commands are registered**

Search for `bot.command` or `composer.command` or where the bot instance handles text commands. It's likely in `hub/src/telegram/bot.ts` or `hub/src/telegram/index.ts`. Read the file.

- [ ] **Step 2: Add /cloud command handler**

```typescript
bot.command('cloud', async (ctx) => {
    const task = ctx.message?.text?.replace('/cloud', '').trim()
    if (!task) {
        await ctx.reply('Usage: /cloud <task description>')
        return
    }

    const engine = getSyncEngine()
    if (!engine) {
        await ctx.reply('Hub not connected')
        return
    }

    const namespace = resolveNamespace(ctx) // existing namespace resolution
    const machines = engine.getOnlineMachinesByNamespace(namespace)
    const worker = machines.find(m =>
        m.metadata?.executorType === 'cloud-self-hosted' || m.metadata?.executorType === 'cloud-managed'
    )
    if (!worker) {
        await ctx.reply('No cloud workers online. Register one first.')
        return
    }

    try {
        const result = await engine.spawnSession(worker.id, {
            runtimeKind: 'daemon-session',
            sessionType: 'simple',
            agent: 'claude',
            yolo: true,
            initialPrompt: task,
            environment: { runtime: { image: 'haqi-workspace:dev' } }
        })
        
        if (result.type === 'success' || result.type === 'accepted') {
            const sessionId = result.type === 'success' ? result.sessionId : result.requestId
            const hubUrl = process.env.HAPI_PUBLIC_URL || 'http://localhost:3006'
            await ctx.reply(`🚀 Agent started!\n\nTask: ${task}\n\n[View session](${hubUrl}/sessions/${sessionId})`, { parse_mode: 'Markdown' })
        } else {
            await ctx.reply(`Failed to start agent: ${result.message ?? 'unknown error'}`)
        }
    } catch (err) {
        await ctx.reply(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
    }
})
```

Note: Read the existing bot code first to match the pattern (how namespace is resolved, how sync engine is accessed, etc.).

- [ ] **Step 3: Typecheck + commit**

```bash
bun typecheck
git add hub/src/telegram/
git commit -m "feat(telegram): add /cloud command for spawning cloud sessions"
```

---

### Task 7: Rebuild + E2E Verification

- [ ] **Step 1: Rebuild Docker image**

```bash
docker build -f Dockerfile.workspace -t haqi-workspace:dev .
```

Verify gh is installed:
```bash
docker run --rm haqi-workspace:dev --auth-token test --port 9876 &
sleep 3
CID=$(docker ps -q | head -1)
docker exec $CID gh --version
docker rm -f $CID
```

- [ ] **Step 2: Full typecheck + tests**

```bash
bun typecheck
bun run test
cd daemon && bun test
```

- [ ] **Step 3: Manual e2e verification**

1. Start dev environment
2. Open Cloud tab → sidebar shows onboarding banner
3. Click through onboarding wizard (or skip)
4. Click "+ New Session" in sidebar → Quick Spawn dialog opens
5. Select checkpoint → type task → Start → session created
6. In session, save checkpoint → checkpoint card appears in chat
7. Verify gh CLI works in container
8. Test Telegram /cloud command (if bot configured)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address UX alignment e2e issues"
```
