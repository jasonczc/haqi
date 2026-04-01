# Cursor Cloud Agent: Complete User Experience Flow Research

Researched 2026-03-31. Based on Cursor official docs, blog posts, changelog, and integration documentation.

---

## Table of Contents

- [Prerequisites & Access](#prerequisites--access)
- [Journey A: First-Time Setup](#journey-a-first-time-setup---i-want-to-set-up-a-cloud-agent-for-my-repo)
- [Journey B: Daily Use](#journey-b-daily-use---i-want-to-give-the-agent-a-coding-task)
- [Journey C: Review](#journey-c-review---i-want-to-check-what-the-agent-did)
- [Journey D: Environment Configuration](#journey-d-environment---i-want-to-change-my-agents-environment)
- [Journey E: Automations](#journey-e-automations---i-want-the-agent-to-auto-review-prs)
- [Access Surfaces Summary](#access-surfaces-summary)
- [API Workflow](#api-workflow)
- [Pricing & Limits](#pricing--limits)

---

## Prerequisites & Access

| Requirement | Detail |
|-------------|--------|
| Plan | Trial or any paid plan (Hobby has limited requests; Pro $20/mo and above include cloud agents) |
| On-demand usage | Must be enabled in Dashboard settings; spend limit set on first use |
| Source control | GitHub or GitLab account connected |
| Repo access | Read-write access to target repo (and any dependent repos/submodules) |

---

## Journey A: First-Time Setup — "I want to set up a cloud agent for my repo"

### Step 1: Navigate to Onboarding

- **URL**: `cursor.com/onboard` (requires login; redirects to WorkOS AuthKit if unauthenticated)
- **What the user sees**: Login gate (email/Google/GitHub SSO via WorkOS)
- **Time**: ~10 seconds if already logged in, ~30 seconds if signing up

### Step 2: Connect Source Control

- **What the user sees**: Prompt to connect GitHub or GitLab account
- **What they click**: "Connect GitHub" or "Connect GitLab" button
- **What happens**: OAuth flow grants Cursor app read-write access to repositories
- **Options**: "All repositories" or select specific repos
- **Time**: ~20 seconds

### Step 3: Select Repository

- **What the user sees**: Repository picker — a list/search of connected repos
- **What they click**: Select the target repository from the list
- **Time**: ~5 seconds

### Step 4: Choose Environment Setup Path

Two paths appear:

#### Path A: Agent-Driven Setup (Recommended)

1. **What the user sees**: "Let the agent set up your environment" option
2. **What they do**: Provide environment variables and secrets needed for dependencies (key-value input fields)
3. **What happens**: Cursor spawns a cloud VM (isolated Ubuntu machine), clones the repo to `/workspace`, and the agent autonomously:
   - Installs dependencies (npm install, pip install, etc.)
   - Verifies the build works
   - Runs tests if applicable
4. **What the user sees**: Live terminal output of the setup process
5. **Final step**: Agent prompts to **save a VM snapshot** for future reuse
6. **What they click**: "Save Snapshot" button
7. **Time**: 2-10 minutes depending on project complexity

#### Path B: Manual Dockerfile Setup (Advanced)

1. **What the user does**: Creates `.cursor/environment.json` in the repo:
   ```json
   {
     "build": {
       "dockerfile": "Dockerfile",
       "context": ".."
     },
     "install": "npm install",
     "start": "sudo service docker start",
     "terminals": [
       { "name": "dev-server", "command": "npm run dev" }
     ]
   }
   ```
2. **Path behavior**: `dockerfile` and `context` are relative to `.cursor` directory; `install` runs from project root
3. **Constraints**: Do NOT copy the full project in Dockerfile (Cursor manages workspace checkout). Computer Use requires Debian/Ubuntu.
4. **Time**: Variable (depends on writing the Dockerfile)

### Step 5: Configure Secrets

- **URL**: `cursor.com/dashboard/cloud-agents` > Secrets tab
- **What the user sees**: Key-value pair interface for secrets
- **What they do**: Add API keys, database credentials, etc.
- **Options**:
  - "Redacted" toggle — prevents accidental commits and hides from agent output
  - Workspace-scoped or team-scoped
- **Storage**: Encrypted at rest with KMS, exposed as environment variables
- **Special**: TOTP 2FA supported — store the shared secret, agent generates codes via `oathtool --totp -b "$TOTP_SECRET"`
- **Time**: ~1-2 minutes per secret

### Step 6: (Optional) Add AGENTS.md

- **What**: Create `AGENTS.md` at repo root with a dedicated "Cursor Cloud specific instructions" section
- **Purpose**: Task-specific commands and context the agent should reference
- **Time**: ~5 minutes

### Step 7: Verify & Launch

- Agent environment is ready
- Snapshot is saved for instant future startups
- User can now launch cloud agents from multiple surfaces

**Total first-time setup: ~5-15 minutes**

---

## Journey B: Daily Use — "I want to give the agent a coding task"

Cloud agents can be launched from **6 different surfaces**. Here is each flow:

### Surface 1: Cursor Web (cursor.com/agents)

1. **Navigate** to `cursor.com/agents` (login required)
2. **What the user sees**: Agent management dashboard — list of running/completed agents, "New Agent" button
3. **Click** "New Agent" or equivalent
4. **Select repository** from dropdown (remembers recent)
5. **Type task** in natural language prompt field: e.g., "Fix the login bug where users get 403 on /api/auth"
6. **Click** "Start" / "Run"
7. **What happens**: VM spins up (uses saved snapshot for fast boot), repo cloned, agent begins working
8. **What the user sees**: Live streaming output — agent's reasoning, file edits, terminal commands, browser screenshots
9. **Time to first action**: ~30-60 seconds (snapshot restore + clone)

### Surface 2: Cursor Desktop IDE

1. **Open** Cursor IDE with project loaded
2. **Press** `Cmd+I` (or click the agent sidepane)
3. **What the user sees**: Agent chat panel on the right side
4. **Select** "Cloud" from the dropdown in the agent input area (vs. local)
5. **Type task** in the input field
6. **Press** Enter to send
7. **What happens**: Cloud VM spins up; agent works in background
8. **Queued Messages**: While agent works, type follow-up instructions and press Enter to queue them. Messages execute sequentially. Press `Cmd+Enter` to bypass queue for urgent interrupts.
9. **Time**: Same as web

### Surface 3: Slack (@cursor)

1. **In any Slack channel** where Cursor app is installed
2. **Type**: `@Cursor fix the login bug in cursor-app`
3. **What happens**:
   - Agent reads message context
   - Infers repo from: explicit mention > recent activity > routing rules > channel default > personal default
   - Spins up cloud VM and begins work
4. **What the user sees in Slack**:
   - Acknowledgment message with "Open in Cursor" button
   - On completion: notification with link to "view the created PR in GitHub"
5. **Advanced options**:
   - Specify model: `@Cursor with opus, fix the login bug`
   - Specify branch: `@Cursor branch=feature/auth fix the login bug`
   - Disable auto-PR: `@Cursor autopr=false refactor the auth module`
6. **Thread behavior**: Reply in thread to add follow-up instructions to same agent
7. **Management**: Use context menu (three dots) for follow-up, deletion, request ID, feedback
8. **Commands**:
   - `@Cursor settings` — manage channel/personal defaults
   - `@Cursor list my agents` — show running agents
   - `@Cursor agent [prompt]` — force new agent (vs. continuing thread)
9. **Time**: ~1 minute to working agent

### Surface 4: GitHub (@cursor in PR/issue comments)

1. **On any PR or issue**, type a comment: `@cursor fix this bug`
2. **What happens**:
   - Agent reads PR diff / issue context
   - Implements fix on a branch
   - Pushes commits to the PR or creates a new PR
3. **Bugbot integration**: Comment `@cursor fix` to apply Bugbot's suggested fixes automatically
4. **Time**: ~1-2 minutes to first commit

### Surface 5: Linear (@cursor)

1. **On any Linear issue**, mention `@cursor` with instructions
2. **What happens**: Agent reads issue context, implements, pushes code
3. **Time**: Similar to GitHub

### Surface 6: PWA (Mobile)

1. **Install** Cursor PWA via iOS Safari or Android Chrome (from cursor.com/agents)
2. **What the user sees**: Mobile-optimized agent dashboard
3. **Interaction**: Same as web — start agents, monitor progress, send follow-ups
4. **Use case**: "Morning commute batch" — kick off multiple tasks from phone

### What the Agent Does (All Surfaces)

Once launched, the cloud agent:

1. **Clones repo** from GitHub/GitLab onto isolated Ubuntu VM
2. **Creates a working branch** (separate from main)
3. **Runs install commands** from environment.json or snapshot
4. **Starts background processes** (dev servers, databases via tmux sessions)
5. **Executes the task** using these tools:
   - Semantic codebase search
   - File reading (including images: png, jpg, gif, webp, svg)
   - Intelligent file editing
   - Terminal command execution with output monitoring
   - Web search
   - Browser control (screenshots, visual verification via noVNC/websockify stack)
   - Image generation for UI mockups
   - Ask clarifying questions
   - Fetch context-specific `.cursor/rules`
6. **Creates PR** automatically (unless disabled) with changes
7. **Notifies user** on completion via the originating surface

**Model**: Cloud agents exclusively use curated models in **Max Mode** (no toggle to disable). Current options include Claude Opus, GPT-5, and Composer 2.

---

## Journey C: Review — "I want to check what the agent did"

### From cursor.com/agents

1. **Navigate** to `cursor.com/agents`
2. **What the user sees**: List of all agents with status indicators (running / completed / failed)
3. **Click** on an agent session
4. **What the user sees**:
   - **Chat timeline**: Full conversation history with agent reasoning
   - **Checkpoints**: Automatic snapshots before significant changes (stored locally, separate from Git)
   - **File diffs**: Changes the agent made
   - **Terminal output**: Commands run and their results
   - **Browser screenshots**: If the agent used browser control
5. **Checkpoint review**:
   - Click any checkpoint in the timeline to **preview files at that point**
   - Click "Restore" to **revert to that checkpoint** (safe rollback)
6. **PR link**: Direct link to the GitHub PR the agent created

### From Cursor Desktop IDE

1. **Open** the agent sidepane (`Cmd+I`)
2. **What the user sees**: Same chat timeline with checkpoints
3. **Click** checkpoints to preview previous file states
4. **Click** "Restore" to revert if needed
5. **Advantage**: Can immediately edit files the agent changed, run local tests, iterate

### From Slack

1. **Agent completion message** appears in thread
2. **Contains**: Link to PR on GitHub, "Open in Cursor" button
3. **Context menu** (three dots): View request ID, provide feedback

### From GitHub

1. **Agent pushes commits** directly to the PR
2. **What the user sees**: Normal GitHub PR diff view with agent's commits
3. **Review flow**: Standard GitHub code review (approve, request changes, comment)

---

## Journey D: Environment — "I want to change my agent's environment"

### Configuration Resolution Order (Priority)

1. `.cursor/environment.json` **in the repository** (highest priority)
2. **Personal** environment configuration (cursor.com/dashboard)
3. **Team** environment configuration (team settings)

This means: repo config overrides personal, personal overrides team defaults.

### Modifying environment.json

Edit `.cursor/environment.json` in the repo:

```json
{
  "build": {
    "dockerfile": "Dockerfile",
    "context": ".."
  },
  "install": "npm install && pip install -r requirements.txt",
  "start": "sudo service docker start",
  "terminals": [
    { "name": "web", "command": "npm run dev" },
    { "name": "api", "command": "python manage.py runserver" }
  ]
}
```

| Field | Purpose | Behavior |
|-------|---------|----------|
| `build.dockerfile` | Custom Dockerfile path | Relative to `.cursor` directory |
| `build.context` | Docker build context | Relative to `.cursor` directory |
| `install` | Dependency installation | Runs on boot, must be idempotent. If >few seconds, auto-snapshots for faster next boot |
| `start` | Background services | Runs after install (e.g., Docker daemon) |
| `terminals` | Named tmux sessions | Long-running processes shared between user and agent |

### Managing Secrets

1. **Navigate** to `cursor.com/dashboard/cloud-agents`
2. **Click** "Secrets" tab
3. **Add/edit/remove** key-value pairs
4. **Options**:
   - Scope: workspace or team
   - Redacted toggle: prevents exposure in agent output and commits
5. **Monorepo tip**: Use prefixed names (`NEXTJS_DB_URL`, `CONVEX_API_KEY`) for multiple `.env` files

### Managing Snapshots

1. **Navigate** to agent dashboard
2. **What snapshots contain**: Installed packages, system dependencies, base environment configuration
3. **Creating**: During onboarding or after significant environment changes, save a snapshot
4. **Including .env.local**: If present during snapshot creation, it's preserved (though Secrets tab is preferred)
5. **Effect**: Future agent sessions boot from snapshot instead of running full install (seconds vs. minutes)

### Docker-in-Docker

Docker works within cloud agent VMs but with caveats:
- Simple workflows work out of the box
- Complex setups benefit from `fuse-overlayfs` and `iptables-legacy` configuration
- Recommended Dockerfile template available in docs for complex scenarios

### Tailscale / Private Network Access

```bash
tailscaled --tun=userspace-networking \
  --outbound-http-proxy-listen=localhost:1054 \
  --socks5-server=localhost:1055
```

Export proxy variables to route traffic through Tailscale for accessing private resources.

### MCP Server Configuration

1. **Navigate** to `cursor.com/agents`
2. **Click** MCP dropdown
3. **Configure** MCP servers:
   - HTTP transport (streamable)
   - stdio transport
   - OAuth authentication supported
4. **Use case**: Access databases, APIs, third-party services from cloud agents

### Resource Limits

- Default VMs: Limited memory and CPU (observed: ~4 cores, ~15GB RAM, ~126GB disk)
- Enterprise customers: Contact support for increased limits
- Self-serve configuration: Coming soon (as of March 2026)

---

## Journey E: Automations — "I want the agent to auto-review PRs"

### Step 1: Navigate to Automations

- **Where**: Cursor dashboard or `cursor.com/agents` area
- **What the user sees**: Automations management page with existing automations listed

### Step 2: Create New Automation (4-step wizard)

#### Step 2a: Select Trigger

Available triggers:

| Trigger Type | Events |
|-------------|--------|
| **Scheduled** | Recurring intervals (preset options or custom cron expressions). Minor execution delays possible. |
| **GitHub** | PR opened (draft), PR ready for review, commits pushed to PR, PR merged, PR commented, branch pushed, CI completed |
| **Slack** | New channel message (with optional keyword/regex filter), public channel created |
| **Webhook** | Private HTTP endpoint with API key authentication |
| **Linear** | Issue created, issue status changed, cycle completed |
| **PagerDuty** | Incident lifecycle events |

**What the user clicks**: Select one trigger type, configure its parameters (e.g., for GitHub: select "Pull Request Ready for Review")

#### Step 2b: Write Instructions

- **What the user sees**: Large text input field
- **What they type**: Natural language instructions for the agent, e.g.:
  ```
  Review this PR for:
  1. Security vulnerabilities
  2. Performance issues
  3. Code style consistency
  4. Test coverage gaps
  Post inline comments for specific issues and a summary comment.
  ```

#### Step 2c: Enable Tools

Available tools the user can toggle on/off:

| Tool | Capability |
|------|-----------|
| Create pull request | Create new PRs with code changes |
| Comment on PR | Post top-level and inline code review comments |
| Request reviewers | Assign specific reviewers |
| Approve/Request changes | If enabled, agent can approve PRs or request changes |
| Send Slack messages | Post to channels (with read access) |
| MCP servers | Connect external tools/services |
| Memory | Persistent memory across automation runs — agent learns from repeated executions |

#### Step 2d: Configure Settings

| Setting | Options |
|---------|---------|
| **Model** | Choose from cloud agent models optimized for autonomous operation |
| **Environment** | Inherited from Cloud Agents dashboard; configurable secrets |
| **Permissions** | **Private**: Individual management and billing. **Team Visible**: Shared visibility, individual billing. **Team Owned**: Shared management, team billing via service account. |

### Step 3: Create & Monitor

- **Click** "Create" button
- **What happens**: Automation is now active and waiting for trigger events
- **Monitoring**: View execution history, logs, and agent output in the dashboard

### Example: Auto-Review PRs

1. Create automation with trigger: **GitHub > Pull Request Ready for Review**
2. Instructions: "Review this PR. Post inline comments for bugs, security issues, and style problems. Approve if no blocking issues found."
3. Enable tools: Comment on PR, Approve/Request changes
4. Set to Team Owned for shared billing
5. Result: Every PR marked "Ready for Review" gets an automated agent review

### Billing

- **Private / Team Visible** automations: Billed to the individual creator
- **Team Owned** automations: Billed to team pool
- Usage charges based on cloud agent consumption (model token costs)

---

## Access Surfaces Summary

| Surface | Launch | Monitor | Review | Follow-up |
|---------|--------|---------|--------|-----------|
| **cursor.com/agents** | New Agent button | Live stream | Chat + checkpoints + diffs | Type in chat |
| **Cursor Desktop** | `Cmd+I` + Cloud dropdown | Sidepane stream | Checkpoints + file preview | Queue messages (Enter) or interrupt (Cmd+Enter) |
| **Slack** | `@Cursor [prompt]` | Thread updates | "Open in Cursor" / PR link | Reply in thread |
| **GitHub** | `@cursor` comment | Commits appear on PR | Standard PR diff | Comment on PR |
| **Linear** | `@cursor` on issue | Status updates | PR link | Comment on issue |
| **PWA (Mobile)** | Same as web | Same as web | Same as web | Same as web |
| **API** | POST to API endpoint | Poll or webhook | API response | API call |

---

## API Workflow

### Authentication

- **Method**: Basic Authentication
- **API Key**: Created at `cursor.com/dashboard/cloud-agents`
- **Format**: `key_[64 hex characters]`
- **Usage**: `curl https://api.cursor.com/... -u YOUR_API_KEY:`

### Rate Limits

Cloud Agents API rate limits are enforced per team, per minute (exact limits for cloud agent endpoints not yet publicly documented; other API endpoints range from 20-250 req/min).

### Workflow (Based on Available Documentation)

1. **Create API key** at Dashboard > Cloud Agents
2. **POST** to create an agent session (specify repo, prompt, model)
3. **Monitor** via polling or webhook callbacks
4. **Retrieve** results (diff, PR URL, agent output)

Note: Detailed endpoint paths and request/response schemas for the Cloud Agents API are marked as Beta and full documentation is not yet publicly available as of March 2026.

---

## Pricing & Limits

| Plan | Price | Agent Access | Usage |
|------|-------|-------------|-------|
| **Hobby** (Free) | $0 | Limited agent requests | Minimal |
| **Pro** | $20/mo | Cloud agents included | Extended limits |
| **Pro+** | $60/mo | Cloud agents included | 3x usage multiplier |
| **Ultra** | $200/mo | Cloud agents included | 20x usage multiplier |
| **Teams** | $40/user/mo | Everything in Pro + team features | Team pools |
| **Enterprise** | Custom | Everything + admin APIs + self-hosted option | Pooled usage, custom resource limits |

**Billing model**: Cloud agents are charged at API pricing for the selected model:
- Composer 2 Standard: $0.50/M input, $2.50/M output tokens
- Composer 2 Fast (default): $1.50/M input, $7.50/M output tokens
- Other models: at their respective API rates

**Self-hosted option** (March 2026): Organizations can run cloud agents on their own infrastructure, keeping code and tool execution within their network.

---

## Technical Architecture (What Runs Under the Hood)

Each cloud agent session runs on an isolated Ubuntu 24.04 VM:

```
User (Web/IDE/Slack/GitHub/API)
       |
       v
Cursor Control Plane (api2.cursor.sh)
       |  Connect-RPC / WebSocket
       v
Cloud VM (Ubuntu 24.04, ~4 cores, ~15GB RAM)
  ├── pod-daemon (Rust) — gRPC process manager
  │     ├── CreateProcess / AttachProcess RPCs
  │     ├── stdout/stderr event streaming
  │     └── SSH auth proxy via vsock to host
  ├── exec-daemon (Node.js) — @anysphere/exec-daemon-runtime
  │     ├── HTTP API + PTY WebSocket
  │     ├── Shell execution, ripgrep, browser automation
  │     └── cursorsandbox (Bubblewrap + seccomp + Landlock)
  ├── noVNC + websockify — browser/desktop access
  ├── /workspace — repo checkout (overlay fs)
  └── tmux sessions — shared terminals
```

Secrets injected as env vars (KMS-encrypted at rest). Git credentials via SSH agent proxy over vsock (no key files in container).

---

*This document synthesizes Cursor official documentation, blog posts, changelog entries, and runtime investigation from the haqi repo. URLs and features accurate as of March 2026; Cursor ships frequently and details may change.*
