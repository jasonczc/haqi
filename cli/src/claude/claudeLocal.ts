import { mkdirSync } from "node:fs";
import { logger } from "@/ui/logger";
import { restoreTerminalState } from "@/ui/terminalState";
import { claudeCheckSession } from "./utils/claudeCheckSession";
import { getProjectPath } from "./utils/path";
import { appendMcpConfigArg } from "./utils/mcpConfig";
import { buildClaudeSystemPrompt } from "./utils/systemPrompt";
import { withBunRuntimeEnv } from "@/utils/bunRuntime";
import { spawnWithAbort } from "@/utils/spawnWithAbort";
import { getHapiBlobsDir } from "@/constants/uploadPaths";
import { stripNewlinesForWindowsShellArg } from "@/utils/shellEscape";
import { getDefaultClaudeCodePath } from "./sdk/utils";
import { readSettings } from "@/persistence";

function shellQuote(value: string): string {
    if (value.length === 0) {
        return '""';
    }

    if (/^[A-Za-z0-9_\/:.,=@%+-]+$/.test(value)) {
        return value;
    }

    return '"' + value.replace(/(["\\$`])/g, '\\$1') + '"';
}

function shellJoin(parts: string[]): string {
    return parts.map(shellQuote).join(' ');
}

async function isExperimentalClaudeLoginShellEnabled(): Promise<boolean> {
    try {
        const settings = await readSettings();
        return settings.experimentalClaudeLoginShell === true;
    } catch {
        return false;
    }
}

export async function claudeLocal(opts: {
    abort: AbortSignal,
    sessionId: string | null,
    mcpServers?: Record<string, any>,
    path: string,
    claudeEnvVars?: Record<string, string>,
    claudeArgs?: string[]
    allowedTools?: string[]
    hookSettingsPath: string
}) {

    // Ensure project directory exists
    const projectDir = getProjectPath(opts.path);
    mkdirSync(projectDir, { recursive: true });

    // Check if user passed explicit session control flags.
    const hasContinueFlag = opts.claudeArgs?.includes('--continue');
    const hasResumeFlag = opts.claudeArgs?.includes('--resume');
    const hasUserSessionControl = Boolean(hasContinueFlag || hasResumeFlag);

    // Determine session strategy:
    // - If resuming an existing session: use --resume (unless user already supplied session control)
    // - If starting fresh: let Claude create a new session ID (reported via SessionStart hook)
    let startFrom = opts.sessionId;
    if (opts.sessionId && !claudeCheckSession(opts.sessionId, opts.path)) {
        startFrom = null;
    }

    if (opts.abort.aborted) {
        logger.debug('[ClaudeLocal] Abort already signaled before spawn; skipping launch');
        return startFrom ?? null;
    }

    // Build args for Claude CLI
    const args: string[] = [];

    if (startFrom && !hasUserSessionControl) {
        // Resume existing session
        args.push('--resume', startFrom);
    }

    const resolvedSystemPrompt = buildClaudeSystemPrompt(opts.path);
    if (resolvedSystemPrompt.trim()) {
        args.push('--append-system-prompt', stripNewlinesForWindowsShellArg(resolvedSystemPrompt));
    }

    const cleanupMcpConfig = appendMcpConfigArg(args, opts.mcpServers, {
        baseDir: projectDir
    });

    if (opts.allowedTools && opts.allowedTools.length > 0) {
        args.push('--allowedTools', opts.allowedTools.join(','));
    }

    // Add custom Claude arguments
    if (opts.claudeArgs) {
        args.push(...opts.claudeArgs);
    }

    // Add hook settings for session tracking
    args.push('--settings', opts.hookSettingsPath);
    logger.debug(`[ClaudeLocal] Using hook settings: ${opts.hookSettingsPath}`);

    // Add blobs directory for file upload access
    args.push('--add-dir', getHapiBlobsDir());
    logger.debug(`[ClaudeLocal] Adding blobs directory: ${getHapiBlobsDir()}`);

    // Prepare environment variables
    // Note: Local mode uses global Claude installation
    const env = {
        ...process.env,
        DISABLE_AUTOUPDATER: '1',
        ...opts.claudeEnvVars
    }

    logger.debug(`[ClaudeLocal] Spawning claude with args: ${JSON.stringify(args)}`);

    const useExperimentalLoginShell = process.platform !== 'win32' && await isExperimentalClaudeLoginShellEnabled();

    // Get Claude executable path
    const claudeCommand = getDefaultClaudeCodePath();
    const shellClaudeCommand = process.env.HAPI_CLAUDE_PATH || 'claude';
    logger.debug(`[ClaudeLocal] Using claude executable: ${claudeCommand}`);
    logger.debug(`[ClaudeLocal] Experimental login shell enabled: ${useExperimentalLoginShell}`);

    // Spawn the process
    try {
        process.stdin.pause();
        const spawnCommand = useExperimentalLoginShell ? '/bin/zsh' : claudeCommand;
        const spawnArgs = useExperimentalLoginShell
            ? ['-lc', shellJoin([shellClaudeCommand, ...args])]
            : args;
        await spawnWithAbort({
            command: spawnCommand,
            args: spawnArgs,
            cwd: opts.path,
            env: withBunRuntimeEnv(env, { allowBunBeBun: false }),
            signal: opts.abort,
            logLabel: 'ClaudeLocal',
            spawnName: 'claude',
            installHint: 'Claude CLI',
            includeCause: true,
            logExit: true,
            shell: false
        });
    } finally {
        cleanupMcpConfig?.();
        process.stdin.resume();
        restoreTerminalState();
    }

    return startFrom ?? null;
}
