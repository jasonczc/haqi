# Interactive Setup Session Design

## Overview

Make setup sessions fully interactive like Cursor's onboarding flow. Remove the `-p` one-shot flag and instead send the initial prompt as the first user message through Hub after the session registers. Users can watch the agent work and chat with it at any time.

## Problem

Current implementation uses Claude Code's `-p` flag which runs in one-shot mode (agent exits after responding). Setup sessions need to be interactive — agent stays alive, user can intervene.

## Solution

1. Remove `-p` flag from `buildSpawnArgs` for setup sessions
2. Agent starts in normal interactive remote mode
3. `initialPrompt` travels through spawn request metadata
4. When Worker reports spawn success, Hub detects `initialPrompt` and sends it as the first user message via `sendMessage`
5. Agent receives message, starts working
6. User sees agent working in Web UI, can send messages anytime

## Data Flow

```
Web UI: spawn({ sessionType: 'setup', initialPrompt: '...' })
  -> Hub -> Worker RPC
  -> Worker: start agent (no -p, normal remote mode)
  -> Agent registers session -> Worker receives webhook
  -> Worker reports to Hub: spawn success (sessionId in metadata)
  -> Hub: detects initialPrompt in spawn metadata -> sendMessage(sessionId, prompt)
  -> Agent receives message -> starts autonomous environment setup
  -> User watches in Web UI, can send messages to intervene
```

## Default Setup Prompt

When `sessionType === 'setup'` and no custom `initialPrompt`, Hub injects:

> "You are setting up the development environment for this project. Analyze the project structure, install all dependencies, configure the development tools, and verify the setup works (e.g., build, test, or start the dev server). Report what you did and confirm everything is working."

Default is injected at Hub side (before sending message), not Worker side.

## Changes

| File | Change |
|------|--------|
| `cli/src/cloud/executors/HostProcessExecutor.ts` | Remove `-p` prompt injection from `buildSpawnArgs` |
| `cli/src/runner/runnerLoop.ts` | Pass `initialPrompt` through session metadata on spawn success |
| `hub/src/sync/syncEngine.ts` | After session registers with `initialPrompt` in metadata, auto-call `sendMessage` |
| `cli/src/modules/common/rpcTypes.ts` | `initialPrompt` already exists, no change needed |
| `shared/src/schemas.ts` | `initialPrompt` already in `MachineSpawnRequest`, no change needed |

## Key Behaviors

- **Interactive**: Agent stays alive after responding, accepts follow-up messages
- **Automatic start**: User doesn't need to manually type the first message
- **Works from any entry point**: Web UI, CLI, or direct API — Hub always sends the message
- **Default prompt**: Setup sessions without custom prompt get a sensible default
- **User override**: Custom `initialPrompt` in spawn request overrides the default

## Testing

- Hub unit test: mock session creation with `initialPrompt` in metadata → verify `sendMessage` called
- End-to-end: spawn setup session → verify Agent receives message → user sends follow-up → Agent responds
