# Cursor Cloud Agent Flow Gap Analysis vs HAQI

Assessed: 2026-04-02

Scope:

- Cursor baseline: current official public product shape as of 2026-04-02
- HAQI baseline: current `feat/self-hosted-worker` branch implementation in this repo

Goal:

- compare end-to-end usage flow, not just feature inventory
- call out where HAQI is already close
- separate "infra exists but UX is thin" from "not implemented"

## 1. Executive summary

Short version:

- If the target is only `Web + self-hosted worker + one-off cloud session`, HAQI is already in the game.
- If the target is the full current Cursor Cloud Agent product, HAQI is still meaningfully behind on repo onboarding, review artifacts, multi-surface launch, and automation/API.

Rough parity estimate:

- `single-surface web cloud workflow`: about **60-65%**
- `self-hosted worker / scheduling foundation`: about **75-80%**
- `review + artifact loop`: about **40-50%**
- `full Cursor product surface including Slack/GitHub/Linear/API/automations`: about **25-35%**

Biggest conclusion:

- HAQI's main gap is no longer "can we run a cloud agent at all?"
- The main gap is now "can a user complete the full product loop with low friction and high confidence?"

## 2. Rating legend

- `Close` = usable, same job-to-be-done mostly covered
- `Partial` = important parts exist, but flow is rough or incomplete
- `Thin` = visible surface exists, but key steps are manual or weakly connected
- `Missing` = no meaningful product flow yet

## 3. Journey-by-journey gap

### Journey A. First-time setup

#### A1. Discover cloud onboarding

Cursor today:

- explicit onboarding path
- repo-first setup framing

HAQI now:

- `/cloud/onboard` exists
- cloud sidebar shows onboarding banner when no workers are present
- onboarding flow is split into worker, setup, checkpoint, secrets

Assessment:

- `Close`

Notes:

- This is one of HAQI's strongest parity points.

Evidence:

- `web/src/components/CloudSidebar.tsx`
- `web/src/routes/cloud/onboard.tsx`

#### A2. Connect source control

Cursor today:

- first-class source-control connection flow
- integrated repo access model
- repo selection happens from connected account context

HAQI now:

- no OAuth or GitHub App style connection flow
- user pastes raw repo URL
- access is driven by manually supplied `GITHUB_TOKEN`

Assessment:

- `Missing`

Gap:

- this is the biggest setup-flow gap
- users must understand repo URL, token scope, and git auth mechanics themselves

Evidence:

- `web/src/routes/cloud/onboard.tsx`
- `web/src/routes/cloud/secrets.tsx`

#### A3. Pick repository from a repo picker

Cursor today:

- repo picker is a core setup primitive

HAQI now:

- no picker
- repo entry is a plain text URL field

Assessment:

- `Missing`

Gap:

- no recent repos
- no branch-aware selection
- no validation against accessible repos
- no inference from user/team context

Evidence:

- `web/src/routes/cloud/onboard.tsx`
- `web/src/components/QuickSpawnDialog.tsx`
- `web/src/components/NewSession/CloudSettingsSection.tsx`

#### A4. Choose setup path: agent-driven vs config-driven

Cursor today:

- supports agent-driven onboarding
- also supports explicit `.cursor/environment.json` path

HAQI now:

- setup session exists and is interactive
- backend can load `.haqi/environment.json` and `.cursor/environment.json`
- but product UX does not present a clear setup-path choice

Assessment:

- `Partial`

Gap:

- capability exists in runtime layer
- user-facing configuration story is weak
- environment configuration is exposed as raw `environmentId` and implicit file loading, not as a clear product flow

Evidence:

- `web/src/routes/cloud/onboard.tsx`
- `cli/src/cloud/environment/workspaceEnvironment.ts`
- `docs/superpowers/specs/2026-04-01-interactive-setup-session-design.md`

#### A5. Save reusable snapshot/checkpoint

Cursor today:

- snapshot is a first-class output of setup
- clearly tied to faster future startups

HAQI now:

- save checkpoint action exists in session header
- checkpoint list and derivation page exist
- onboarding step tells the user to go save one manually, then come back

Assessment:

- `Partial`

Gap:

- checkpoint creation is implemented
- but onboarding does not observe completion automatically
- step 3 is effectively an instruction screen, not a real guided flow

Evidence:

- `web/src/components/SessionHeader.tsx`
- `web/src/routes/cloud/checkpoints.tsx`
- `web/src/routes/cloud/onboard.tsx`

#### A6. Configure secrets

Cursor today:

- secret management is part of cloud setup
- supports scoped secrets and some policy UX

HAQI now:

- cloud secrets page exists
- onboarding asks for `GITHUB_TOKEN` plus extra env secrets
- secrets support adapter/mount mode/file path/env name

Assessment:

- `Partial`

Gap:

- no workspace/team scoping UX
- no "redacted" semantics
- no TOTP helper flow
- no repo-aware recommended secrets
- onboarding hardcodes `GITHUB_TOKEN` as required

Evidence:

- `web/src/routes/cloud/onboard.tsx`
- `web/src/routes/cloud/secrets.tsx`

#### A7. Onboarding completion state

Cursor today:

- account-level product state

HAQI now:

- onboarding completion stored in browser `localStorage`

Assessment:

- `Thin`

Gap:

- completion is device/browser-local
- not user/account/global state

Evidence:

- `web/src/components/CloudSidebar.tsx`
- `web/src/routes/cloud/onboard.tsx`

### Journey B. Daily launch flow

#### B1. Quick spawn from web

Cursor today:

- short new-agent flow
- repo + prompt centric

HAQI now:

- `QuickSpawnDialog` exists
- supports checkpoint, task, setup mode, advanced options
- launched from cloud sidebar

Assessment:

- `Close`

Gap:

- repo picker missing
- defaults are still fairly raw
- worker selection is implicit and simple

Evidence:

- `web/src/components/QuickSpawnDialog.tsx`
- `web/src/components/CloudSidebar.tsx`

#### B2. Rich advanced spawn controls

Cursor today:

- environment-aware launch with fewer low-level knobs exposed to normal users

HAQI now:

- full create-session form exposes backend, runtime kind, launch mode, environment ID, checkpoint, repo URL, network policy, labels, secrets, workspace mode, preview policy, TTL

Assessment:

- `Partial`

Gap:

- strong infra coverage
- weak product ergonomics
- many fields are IDs / raw text rather than structured choices
- advanced form still feels operator-oriented, not task-oriented

Evidence:

- `web/src/components/NewSession/CloudSettingsSection.tsx`

#### B3. Queue and async spawn feedback

Cursor today:

- cloud runs are clearly asynchronous

HAQI now:

- accepted cloud requests land in `/cloud/requests`
- request detail page polls phase and redirects to session on success

Assessment:

- `Close`

Gap:

- flow is solid, but visual polish is still thinner than Cursor

Evidence:

- `web/src/routes/cloud/requests.tsx`
- `web/src/routes/cloud/request.tsx`

### Journey C. Running session control

#### C1. Interactive setup and follow-up

Cursor today:

- setup is interactive
- users can follow up while the agent is running

HAQI now:

- setup sessions are interactive by design
- initial prompt is sent after registration
- normal session chat/composer supports follow-up messaging

Assessment:

- `Close`

Gap:

- lacks the richer surface-specific follow-up ergonomics that Cursor has in Slack / Linear / IDE cloud pane

Evidence:

- `docs/superpowers/specs/2026-04-01-interactive-setup-session-design.md`
- `hub/src/sync/syncEngine.ts`
- `web/src/components/SessionChat.tsx`

#### C2. Remote preview / desktop takeover

Cursor today:

- cloud agent can demo work in-browser
- remote desktop takeover is part of the review loop

HAQI now:

- session preview route exists
- desktop page exists
- recording controls exist on desktop page

Assessment:

- `Partial`

Gap:

- foundational pieces exist
- still less integrated into the main review flow than Cursor
- artifact story is mostly manual

Evidence:

- `web/src/routes/sessions/preview.tsx`
- `web/src/routes/sessions/desktop.tsx`
- `hub/src/web/routes/desktop.ts`

#### C3. Local worker lifecycle from web

Cursor self-hosted today:

- worker bootstrap is positioned as a product-level action

HAQI now:

- local one-click worker start exists
- worker status, logs, stop/restart are exposed in workers page
- onboarding also exposes one-click local start

Assessment:

- `Close`

Gap:

- remote fleet bootstrap remains CLI/token oriented
- still no large-fleet operational UX

Evidence:

- `web/src/routes/cloud/workers.tsx`
- `web/src/routes/cloud/onboard.tsx`
- `hub/src/web/routes/cloud.ts`

### Journey D. Review and trust loop

#### D1. Session-level summary of what happened

Cursor today:

- review is centered on PR plus artifacts plus summary

HAQI now:

- session header exposes metadata chips
- session chat / terminal / files / preview are all navigable

Assessment:

- `Partial`

Gap:

- summary exists as raw session metadata more than a polished review story
- the experience feels tool-centric, not review-centric

Evidence:

- `web/src/components/SessionHeader.tsx`

#### D2. Checkpoint event visible inline in timeline

Cursor today:

- snapshot/checkpoint is visible in review flow

HAQI now:

- backend sends a checkpoint message with metadata after successful save
- frontend does not appear to render a dedicated checkpoint card

Assessment:

- `Thin`

Gap:

- data path exists
- UX path is not actually completed

Evidence:

- `hub/src/sync/syncEngine.ts`
- no matching checkpoint renderer found in `web/src`

#### D3. Preview/restore checkpoint in review flow

Cursor today:

- checkpoint restore is part of the review loop

HAQI now:

- checkpoint page supports `New Session`, `Derive`, `Delete`
- no file-state preview
- no in-place restore workflow

Assessment:

- `Thin`

Gap:

- checkpoint is treated more like an image artifact than a review primitive

Evidence:

- `web/src/routes/cloud/checkpoints.tsx`

#### D4. PR creation and PR visibility

Cursor today:

- PR is a first-class output of the run

HAQI now:

- `gh` is installed in workspace image
- setup/task prompt adds `gh pr create --fill` instruction when repo is GitHub
- session header can display a PR badge if `pullRequestUrl` exists

Assessment:

- `Thin`

Gap:

- PR creation relies on prompt compliance, not a stronger workflow
- no code path currently writes `pullRequestUrl` into session metadata
- so the review badge path is not actually closed

Evidence:

- `Dockerfile.workspace`
- `hub/src/sync/syncEngine.ts`
- `web/src/components/SessionHeader.tsx`

#### D5. Automatic review artifacts: screenshots, videos, logs

Cursor today:

- explicit artifact-heavy review model

HAQI now:

- terminal logs exist
- desktop recording exists
- preview exists

Assessment:

- `Partial`

Gap:

- artifacts are not automatically packaged as "proof of work"
- screenshots/videos are not surfaced as first-class run outputs
- no completion report bundling

Evidence:

- `web/src/routes/sessions/desktop.tsx`
- `web/src/routes/sessions/preview.tsx`

### Journey E. Environment configuration lifecycle

#### E1. Repo-specific environment config

Cursor today:

- environment config is clearly part of the repo cloud story

HAQI now:

- backend supports repo-local environment files
- environment IDs can be referenced from UI

Assessment:

- `Partial`

Gap:

- the backend is ahead of the product UX
- there is no clean "edit the environment for this repo" user flow

Evidence:

- `cli/src/cloud/environment/workspaceEnvironment.ts`
- `web/src/components/NewSession/CloudSettingsSection.tsx`

#### E2. Terminals/services/language servers as visible setup outputs

Cursor today:

- setup produces observable dev environment structure

HAQI now:

- runner tracks service endpoints, language servers, terminal descriptors
- session header shows counts

Assessment:

- `Partial`

Gap:

- metadata exists
- but there is not yet a rich environment inspector UX

Evidence:

- `cli/src/runner/runnerLoop.ts`
- `web/src/components/SessionHeader.tsx`

### Journey F. Multi-surface launch

#### F1. Web

Assessment:

- `Close`

#### F2. Mobile / phone

HAQI now:

- PWA exists
- Telegram Mini App exists

Assessment:

- `Partial`

Gap:

- strong phone access exists
- but cloud-specific mobile flow is still just the generic app, not a cloud-agent-first surface

Evidence:

- `docs/guide/pwa.md`
- `hub/src/telegram/bot.ts`

#### F3. Telegram

HAQI now:

- `/cloud <task>` command exists

Assessment:

- `Partial`

Gap:

- this is useful parity for one messaging surface
- but much thinner than Cursor's documented Slack workflow

Evidence:

- `hub/src/telegram/bot.ts`

#### F4. Slack

HAQI now:

- no Slack launch/control flow found

Assessment:

- `Missing`

#### F5. GitHub issue/PR comment trigger

HAQI now:

- no GitHub-triggered cloud agent flow found

Assessment:

- `Missing`

#### F6. Linear trigger

HAQI now:

- no Linear-triggered cloud agent flow found

Assessment:

- `Missing`

#### F7. Public cloud-agent API

HAQI now:

- internal app API for machine spawn exists
- no user-facing external "create/list/follow-up cloud agent run" API comparable to Cursor's product API

Assessment:

- `Missing`

Evidence:

- `hub/src/web/routes/machines.ts`

### Journey G. Self-hosted deployment mode

#### G1. Worker enrollment and visibility

HAQI now:

- worker enrollment tokens exist
- worker list exists
- worker metadata and status are visible
- scheduler path exists

Assessment:

- `Close`

Evidence:

- `hub/src/web/routes/cloud.ts`
- `hub/src/cloud/spawnCoordinator.ts`
- `web/src/routes/cloud/workers.tsx`

#### G2. Same UX, customer-owned execution

HAQI now:

- this is the branch's strongest architectural story
- cloud sessions, checkpoints, setup, and desktop are all being built around self-hosted workers

Assessment:

- `Close`

Gap:

- still less polished than Cursor enterprise story
- but the core deployment model is not missing anymore

#### G3. Fleet-scale ops

Cursor today:

- public story includes Helm/operator/fleet APIs

HAQI now:

- no equivalent productized fleet management layer found

Assessment:

- `Thin`

### Journey H. Automations and event-driven runs

Cursor today:

- automations are part of the same cloud-agent platform

HAQI now:

- no cloud-agent automation product flow found
- no event-driven scheduled cloud agent system found

Assessment:

- `Missing`

## 4. What HAQI is already surprisingly close on

These are stronger than they may look from the outside:

1. Self-hosted worker enrollment and routing
2. Cloud onboarding as a distinct product flow
3. Interactive setup sessions
4. Quick spawn from web
5. Async request tracking
6. Container-backed preview / desktop foundations
7. Runtime support for environment files and checkpoint reuse

## 5. Biggest gaps in order

### Gap 1. Source-control onboarding is still manual

Why it matters:

- this is the first thing users feel
- it keeps HAQI feeling operator-grade instead of product-grade

Missing pieces:

- GitHub connection flow
- repo picker
- repo permission model
- repo-aware defaults

### Gap 2. Review loop is weaker than launch loop

Why it matters:

- Cursor's current product edge is not just starting an agent
- it is trusting the result quickly

Missing pieces:

- true checkpoint card in timeline
- restore/preview workflow
- PR URL plumbing
- artifact bundling

### Gap 3. Environment UX lags backend capability

Why it matters:

- HAQI already has meaningful runtime primitives
- users still see raw IDs and manual steps

Missing pieces:

- repo-specific environment editor / explainer
- clearer setup path choice
- better checkpoint/environment selection UX

### Gap 4. Multi-surface parity is still narrow

Why it matters:

- Cursor positions cloud agents as "wherever you already work"

Missing pieces:

- Slack
- GitHub triggers
- Linear triggers
- public API

### Gap 5. No automation product story yet

Why it matters:

- Cursor's platform is already moving from ad hoc runs to recurring runs
- without this, HAQI is still a session product, not a cloud-agent platform

## 6. Product recommendation

If the goal is to feel much closer to Cursor quickly, the best next sequence is:

1. Close the review loop before adding more launch surfaces
2. Add repo connection + repo picker before adding more low-level runtime knobs
3. Turn checkpoint into a visible, reviewable, reusable first-class object in the session timeline
4. Fix PR URL plumbing end to end
5. Only then expand to GitHub / Slack / API / automations

## 7. Bottom line

How far are we?

- On the `can a user start and run a self-hosted cloud agent from the web?` question: **not far**
- On the `does the whole product loop feel as complete as Cursor Cloud Agents?` question: **still far**

Most important nuance:

- HAQI is no longer behind because the runtime is missing
- HAQI is behind because too many steps still require operator knowledge, manual context stitching, or trust leaps during review

## 8. Key references

Cursor:

- https://cursor.com/blog/cloud-agents
- https://cursor.com/blog/agent-computer-use
- https://cursor.com/blog/automations
- https://cursor.com/blog/self-hosted-cloud-agents/
- https://cursor.com/changelog/03-25-26

HAQI implementation:

- `web/src/components/QuickSpawnDialog.tsx`
- `web/src/components/CloudSidebar.tsx`
- `web/src/routes/cloud/onboard.tsx`
- `web/src/routes/cloud/workers.tsx`
- `web/src/routes/cloud/checkpoints.tsx`
- `web/src/routes/cloud/request.tsx`
- `web/src/routes/cloud/secrets.tsx`
- `web/src/routes/sessions/desktop.tsx`
- `web/src/components/SessionHeader.tsx`
- `hub/src/web/routes/cloud.ts`
- `hub/src/web/routes/machines.ts`
- `hub/src/sync/syncEngine.ts`
- `cli/src/cloud/environment/workspaceEnvironment.ts`
- `Dockerfile.workspace`
