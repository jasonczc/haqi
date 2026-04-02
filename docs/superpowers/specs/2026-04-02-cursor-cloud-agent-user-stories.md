# Cursor Cloud Agent User Story Map

Researched: 2026-04-02

Goal: extract the stable usage scenarios behind Cursor Cloud Agents / Background Agents, separate them from volatile product details, and give HAQI a cleaner user-story baseline.

## 1. Current product reality

There is a naming transition in progress:

- Older and still-live docs mostly say `Background Agents`
- Newer product blog + changelog say `Cloud Agents`
- Newer enterprise/security material says `Self-hosted Cloud Agents`

Working assumption for product planning:

- `Background Agents` = older documentation name
- `Cloud Agents` = current public product name
- `Self-hosted Cloud Agents` = same top-level product experience, but tool execution runs on customer-owned workers

This naming split is itself a signal: do not anchor HAQI design decisions to a specific Cursor label or page name.

## 2. What looks stable

Across official docs, blog posts, changelog entries, and API docs, the stable core is not a specific screen. It is this product promise:

- async coding agent
- remote isolated execution environment
- repo-aware execution
- can be launched from multiple surfaces
- can be steered after launch
- produces reviewable outputs: branch, PR, logs, summaries, screenshots/videos
- can run in hosted mode or self-hosted mode
- increasingly extends from ad hoc tasks to automated workflows

That is the durable layer. Everything else is implementation detail.

## 3. Stable user stories

### Story A. Offload a bug without losing focus

User story:

- As an engineer already in the middle of another task, I want to hand a bug to a cloud agent from the nearest surface, so that I do not context-switch and can review the result later.

Why this looks stable:

- Cursor's October 30, 2025 Cloud Agents launch post explicitly frames bug fixing as the first core use case.
- The same post says kicking off a cloud agent from Slack or Cursor can be faster than filing an issue.

Operational shape:

- trigger from IDE, web, Slack, GitHub, Linear
- async run in remote environment
- come back later to inspect summary, branch, PR, artifacts

Implication for HAQI:

- "quick task handoff" is a primary story, not a side feature
- spawn friction matters more than setup depth for repeat users

### Story B. Batch small tasks in parallel

User story:

- As an engineer with many low-priority todos, I want to start several cloud agents in parallel, so that routine work gets done while I am away from my laptop.

Why this looks stable:

- The launch post centers "run many agents at once"
- It also uses "quick todos" and "commute / before lunch" as explicit examples

Operational shape:

- multiple parallel runs
- low ceremony prompt entry
- monitor from web/mobile later

Implication for HAQI:

- quick spawn + session list + lightweight status matter more than a giant form
- cloud UX should optimize repeated dispatch, not only initial setup

### Story C. Plan locally, execute remotely

User story:

- As an engineer working on a more complex change, I want to create or refine the plan locally, then hand implementation to a cloud agent, so that I can preserve control without doing the execution myself.

Why this looks stable:

- Cursor's launch post says complex features work best after a detailed plan exists
- It explicitly mentions plan mode sending implementation to cloud

Operational shape:

- local clarification
- remote implementation
- later review / correction / takeover

Implication for HAQI:

- "setup / plan / execute" is a stronger story than only "one-shot prompt"
- interactive setup sessions make sense because planning and execution are distinct jobs

### Story D. Let the environment bootstrap itself once, then reuse it

User story:

- As a team setting up a repo for cloud execution, I want the agent or config to establish the environment and save a reusable snapshot, so that future runs start quickly and predictably.

Why this looks stable:

- Background Agent docs consistently describe machine setup, package install, `.cursor/environment.json`, `tmux` terminals, and snapshots
- February 24, 2026 blog says agents can onboard themselves onto a codebase

Operational shape:

- first-run environment setup
- install/start/terminal config
- snapshot creation
- later runs restore from checkpoint/snapshot

Implication for HAQI:

- onboarding + setup session + checkpoint are one coherent story
- checkpoint should be a first-class concept in cloud UX, not a hidden expert feature

### Story E. Review results without pulling the branch locally

User story:

- As a reviewer or task owner, I want to inspect what the agent changed and how it validated the work, so that I can accept, refine, or reject it without reproducing everything myself.

Why this looks stable:

- Official API docs expose branch name, PR URL, summary, status
- February 24, 2026 blog emphasizes screenshots, videos, logs, merge-ready PRs
- Slack / GitHub docs emphasize completion notifications and PR links

Operational shape:

- read summary
- inspect diff / PR
- inspect logs and visual artifacts
- optionally send follow-up

Implication for HAQI:

- timeline events, checkpoint cards, PR badges, terminal logs, preview artifacts are core review UX
- "agent finished" is not enough; proof-of-work matters

### Story F. Steer a running agent instead of restarting from zero

User story:

- As a user who sees the agent going in the wrong direction or missing context, I want to send follow-up instructions or take over the environment, so that work stays on the same run instead of being thrown away.

Why this looks stable:

- Background Agent docs repeatedly mention follow-ups and taking over
- Slack and Linear integrations both document follow-up patterns
- February 24, 2026 blog adds remote desktop takeover

Operational shape:

- follow-up messages
- shared session continuity
- optional manual takeover of remote desktop / environment

Implication for HAQI:

- cloud session should feel resumable and steerable
- follow-up UX is more important than perfect initial prompts

### Story G. Trigger the same agent capability from whatever workflow tool the team already uses

User story:

- As a team member living in Slack, GitHub, Linear, web, or the IDE, I want to start or continue agent work from that surface, so that the agent fits the workflow I already have.

Why this looks stable:

- Cursor repeatedly markets multi-surface launch as a core advantage
- Official surfaces now include editor, web, Slack, GitHub, Linear, API, and recent blog also says mobile

Operational shape:

- same backend capability
- many entry points
- shared run identity across surfaces

Implication for HAQI:

- surface parity matters
- but the deeper invariant is "one run, many control surfaces"

### Story H. Turn successful ad hoc work into automations

User story:

- As a team that finds repeated agent tasks, I want to run them on schedules or external triggers, so that review, monitoring, triage, and maintenance happen continuously.

Why this looks stable:

- March 5, 2026 Automations launch says automations run on schedules or events from Slack, Linear, GitHub, PagerDuty, and webhooks
- The article gives concrete examples: security review, codeowner assignment, incident response, weekly summaries, test coverage, bug triage

Operational shape:

- trigger
- cloud sandbox execution
- use MCPs / plugins / memory
- notify external systems and optionally create PRs

Implication for HAQI:

- cloud agent should not be modeled only as an interactive session
- durable cloud architecture needs an automation path from day one

### Story I. Keep execution inside the customer network

User story:

- As a regulated or infra-heavy team, I want the cloud-agent UX without sending code, secrets, or build execution outside my environment, so that I can adopt agents without changing my security model.

Why this looks stable:

- March 25, 2026 self-hosted announcement and changelog both position this as a first-class product direction
- Official messaging says self-hosted keeps code, build outputs, and secrets inside customer infrastructure while preserving the same cloud-agent experience

Operational shape:

- worker connects outbound
- no inbound port requirement
- each session gets a worker / isolated execution context
- hosted UX, customer-owned execution

Implication for HAQI:

- self-hosted worker is not a niche extension; it is a top-level deployment mode
- worker enrollment, fleet visibility, and routing are part of the product surface, not infra-only concerns

## 4. Volatile or conflicting areas

These are the parts that currently look unstable and should not be treated as hard product truth.

### 4.1 Naming and IA are still moving

- Docs: `Background Agents`
- Blog / changelog: `Cloud Agents`
- Self-hosted pages: `Self-hosted Cloud Agents`

Meaning:

- do not mirror Cursor's exact labels too literally
- anchor HAQI to jobs-to-be-done and capability boundaries

### 4.2 Integration matrix is broader in marketing than in docs

Official public material now mentions:

- editor
- web
- Slack
- GitHub
- Linear
- API
- automations
- mobile

But not every surface has the same depth of documentation, and some capabilities appear in product announcements before they are fully reflected in docs.

Meaning:

- define HAQI's primary surfaces deliberately
- avoid assuming all surfaces deserve equal initial investment

### 4.3 GitHub support looks much more solid than GitLab

Current evidence points to GitHub as the primary repo substrate:

- Background Agent API docs describe GitHub repository integration
- GitHub integration docs are explicit about clone / push / PR flows
- Linear setup snippets explicitly say "connect GitHub"
- recent community reports still complain about GitLab and self-hosted GitLab gaps

Meaning:

- do not bake "GitHub or GitLab parity" into the core story until verified
- for product scope, treat GitHub-first as the stable baseline

### 4.4 Self-hosted routing still looks operationally fuzzy

Official announcement says self-hosted offers the same capabilities and can be launched from all surfaces, including API and automations.

But recent community threads ask:

- how to force API and automations to use self-hosted workers only
- why self-hosted workers show empty repo pickers
- why certain GitHub PR permissions do not behave as expected for API-spawned agents

Meaning:

- self-hosted is real and strategic
- self-hosted routing, repo selection, and surface parity are still maturing

### 4.5 Review artifacts are expanding faster than docs stabilize

Recent blog material emphasizes:

- screenshots
- videos
- logs
- remote desktop takeover

Self-hosted announcement says some of this is still coming soon for self-hosted.

Meaning:

- artifact-rich review is strategic
- exact artifact set per deployment mode is still moving

## 5. Recommended HAQI framing

Instead of copying Cursor page-for-page, use this user-story stack:

### Tier 1. Core async coding workflow

- launch an agent fast
- run remotely
- follow up
- review result
- accept via PR / branch / diff

### Tier 2. Environment reuse

- onboard repo
- configure environment
- save checkpoint
- spawn from checkpoint

### Tier 3. Multi-surface control

- IDE
- web / mobile
- Slack / Telegram
- GitHub / issue tracker

### Tier 4. Enterprise deployment mode

- hosted
- self-hosted worker
- policy / routing / permissions

### Tier 5. Automations

- scheduled review
- incident / webhook triggered work
- recurring hygiene

## 6. Direct product conclusions for HAQI

If HAQI wants to align with Cursor Cloud Agent's durable user stories, the highest-signal bets are:

1. Make cloud spawn extremely fast for repeat users
2. Treat setup session + checkpoint as first-class onboarding
3. Make follow-up and review stronger than initial prompt authoring
4. Keep one run accessible from many surfaces
5. Treat self-hosted worker as a core deployment mode, not an advanced tab
6. Keep GitHub-first assumptions explicit
7. Design an automation path early, even if the UI lands later

## 7. What changed vs our older repo notes

Compared with older repo research, the most important corrections are:

- "Cloud Agent supports GitHub or GitLab" is not stable enough to use as a core story
- the product is moving from `Background Agents` toward `Cloud Agents`
- self-hosted is now official and should be modeled as first-class
- review artifacts and remote desktop are now much more central to the story
- automations are no longer adjacent; they are part of the same cloud-agent platform

## 8. Source set

Official:

- Cursor blog, `Cloud Agents`, 2025-10-30: https://cursor.com/blog/cloud-agents
- Cursor blog, `Cursor agents can now control their own computers`, 2026-02-24: https://cursor.com/blog/agent-computer-use
- Cursor blog, `Build agents that run automatically`, 2026-03-05: https://cursor.com/blog/automations
- Cursor blog, `Run cloud agents in your own infrastructure`, 2026-03-25: https://cursor.com/blog/self-hosted-cloud-agents/
- Cursor changelog, `Self-hosted Cloud Agents`, 2026-03-25: https://cursor.com/changelog/03-25-26
- Cursor docs, `Background Agent`: https://docs.cursor.com/en/background-agent
- Cursor docs, `GitHub`: https://docs.cursor.com/en/integrations/github
- Cursor docs, `Slack`: https://docs.cursor.com/en/integrations/slack
- Cursor docs, `Linear`: https://docs.cursor.com/en/integrations/linear
- Cursor docs, `Background Agent API overview`: https://docs.cursor.com/background-agent/api/overview
- Cursor docs, `List Agents`: https://docs.cursor.com/background-agent/api/list-agents

Community signals for instability:

- https://forum.cursor.com/t/how-to-ensure-automations-and-api-agent-runs-use-self-hosted-workers-only-not-cursor-hosted/156021
- https://forum.cursor.com/t/self-hosted-worker-online-but-empty-repo-list-in-agents-ui/156060
- https://forum.cursor.com/t/background-agents-spawned-via-api-cannot-post-pr-comments-or-reviews-despite-correct-github-app-permissions/153207
- https://forum.cursor.com/t/cloud-agents-require-github-connection-and-cannot-access-gitlab-branches/153549
- https://forum.cursor.com/t/cant-setup-cloud-code-agents-with-a-self-hosted-gitlab-repository/149712
