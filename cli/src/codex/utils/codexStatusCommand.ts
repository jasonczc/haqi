import { execFile, type ExecFileOptions } from 'child_process';
import { promisify } from 'util';
import type { PermissionMode } from '@/codex/loop';
import type { CollaborationMode } from '@/codex/appServerTypes';
import { CodexAppServerClient } from '@/codex/codexAppServerClient';

const execFileAsync = promisify(execFile);
const STATUS_COMMAND_TIMEOUT_MS = 5_000;
const MAX_PREVIEW_LENGTH = 180;

type CommandResult = {
    success: boolean;
    stdout: string;
    stderr: string;
    error?: string;
};

type NativeStatusSnapshot = {
    accountType?: string;
    accountEmail?: string;
    planType?: string;
    authMethod?: string;
    requiresOpenaiAuth?: boolean;
    creditsBalance?: string;
    creditsHasCredits?: boolean;
    creditsUnlimited?: boolean;
    primaryUsedPercent?: number;
    primaryResetsAt?: number;
    secondaryUsedPercent?: number;
    secondaryResetsAt?: number;
    model?: string;
};

type NativeStatusErrors = Partial<Record<'appServer' | 'account' | 'auth' | 'rateLimits' | 'config', string>>;

export type CodexQueueSnapshot = {
    pendingCount: number;
    inQueue: boolean;
    taskRunning: boolean;
    nextPreview?: string;
};

function toText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (Buffer.isBuffer(value)) {
        return value.toString('utf8');
    }
    return '';
}

function toSingleLinePreview(text: string): string {
    const compact = text
        .trim()
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' | ');
    if (!compact) {
        return '';
    }
    if (compact.length <= MAX_PREVIEW_LENGTH) {
        return compact;
    }
    return `${compact.slice(0, MAX_PREVIEW_LENGTH)}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function formatBoolean(value: boolean | undefined): string {
    if (value === undefined) return 'unknown';
    return value ? 'yes' : 'no';
}

function formatResetAt(seconds: number | undefined): string {
    if (!seconds) {
        return 'unknown';
    }
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) {
        return 'unknown';
    }
    return date.toLocaleString();
}

function formatUsageWindow(usedPercent: number | undefined, resetsAt: number | undefined): string {
    const used = usedPercent === undefined ? 'unknown' : `${usedPercent}%`;
    return `${used}, resets at ${formatResetAt(resetsAt)}`;
}

function pickRateLimitEntry(rateLimitsResponse: Record<string, unknown>): Record<string, unknown> | null {
    const primary = asRecord(rateLimitsResponse.rateLimits);
    if (primary) {
        return primary;
    }

    const map = asRecord(rateLimitsResponse.rateLimitsByLimitId);
    if (!map) {
        return null;
    }

    const codexEntry = asRecord(map.codex);
    if (codexEntry) {
        return codexEntry;
    }

    for (const value of Object.values(map)) {
        const entry = asRecord(value);
        if (entry) return entry;
    }

    return null;
}

async function readNativeStatus(cwd: string): Promise<{ snapshot: NativeStatusSnapshot; errors: NativeStatusErrors }> {
    const snapshot: NativeStatusSnapshot = {};
    const errors: NativeStatusErrors = {};
    const client = new CodexAppServerClient();

    try {
        await client.connect();
        await client.initialize({
            clientInfo: {
                name: 'hapi-codex-status',
                version: '1.0.0'
            }
        });
    } catch (error) {
        errors.appServer = getErrorMessage(error);
        try {
            await client.disconnect();
        } catch {}
        return { snapshot, errors };
    }

    try {
        try {
            const accountResponse = await client.readAccount();
            const account = asRecord(accountResponse.account);
            snapshot.accountType = asString(account?.type);
            snapshot.accountEmail = asString(account?.email);
            snapshot.planType = asString(account?.planType);
            snapshot.requiresOpenaiAuth = asBoolean(accountResponse.requiresOpenaiAuth);
        } catch (error) {
            errors.account = getErrorMessage(error);
        }

        try {
            const authResponse = await client.readAuthStatus();
            snapshot.authMethod = asString(authResponse.authMethod);
            if (snapshot.requiresOpenaiAuth === undefined) {
                snapshot.requiresOpenaiAuth = asBoolean(authResponse.requiresOpenaiAuth);
            }
        } catch (error) {
            errors.auth = getErrorMessage(error);
        }

        try {
            const rateLimitsResponse = await client.readRateLimits();
            const selectedEntry = pickRateLimitEntry(asRecord(rateLimitsResponse) ?? {});
            if (selectedEntry) {
                if (!snapshot.planType) {
                    snapshot.planType = asString(selectedEntry.planType);
                }
                const credits = asRecord(selectedEntry.credits);
                snapshot.creditsBalance = asString(credits?.balance);
                snapshot.creditsHasCredits = asBoolean(credits?.hasCredits);
                snapshot.creditsUnlimited = asBoolean(credits?.unlimited);

                const primary = asRecord(selectedEntry.primary);
                snapshot.primaryUsedPercent = asNumber(primary?.usedPercent);
                snapshot.primaryResetsAt = asNumber(primary?.resetsAt);

                const secondary = asRecord(selectedEntry.secondary);
                snapshot.secondaryUsedPercent = asNumber(secondary?.usedPercent);
                snapshot.secondaryResetsAt = asNumber(secondary?.resetsAt);
            }
        } catch (error) {
            errors.rateLimits = getErrorMessage(error);
        }

        try {
            const configResponse = await client.readConfig();
            const config = asRecord(configResponse.config);
            snapshot.model = asString(config?.model);
        } catch (error) {
            errors.config = getErrorMessage(error);
        }
    } finally {
        try {
            await client.disconnect();
        } catch {}
    }

    return { snapshot, errors };
}

async function runCodexCommand(args: string[], cwd: string): Promise<CommandResult> {
    const options: ExecFileOptions = {
        cwd,
        env: process.env,
        timeout: STATUS_COMMAND_TIMEOUT_MS,
        windowsHide: true
    };

    try {
        const { stdout, stderr } = await execFileAsync('codex', args, options);
        return {
            success: true,
            stdout: toText(stdout),
            stderr: toText(stderr)
        };
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & {
            stdout?: string | Buffer;
            stderr?: string | Buffer;
        };
        return {
            success: false,
            stdout: toText(execError.stdout),
            stderr: toText(execError.stderr),
            error: execError.message
        };
    }
}

export function isCodexStatusCommand(text: string): boolean {
    const trimmed = text.trim();
    return trimmed === '/status' || trimmed === '/codex-status';
}

export async function buildCodexStatusMessage(opts: {
    cwd: string;
    mode: 'local' | 'remote';
    sessionId: string | null;
    permissionMode?: PermissionMode;
    collaborationMode?: CollaborationMode['mode'];
    queueSnapshot?: CodexQueueSnapshot;
}): Promise<string> {
    const [versionResult, loginStatusResult, nativeStatus] = await Promise.all([
        runCodexCommand(['--version'], opts.cwd),
        runCodexCommand(['login', 'status'], opts.cwd),
        readNativeStatus(opts.cwd)
    ]);

    const versionPreview = toSingleLinePreview(versionResult.stdout || versionResult.stderr);
    const loginStatusPreview = loginStatusResult.success
        ? toSingleLinePreview(loginStatusResult.stdout || loginStatusResult.stderr) || 'ok'
        : `failed (${toSingleLinePreview(loginStatusResult.stderr || loginStatusResult.stdout || loginStatusResult.error || 'failed')})`;

    const { snapshot, errors } = nativeStatus;
    const nativeWarnings = Object.entries(errors)
        .filter(([, message]) => Boolean(message))
        .map(([scope, message]) => `${scope}: ${toSingleLinePreview(message ?? '')}`)
        .filter(Boolean)
        .join('; ');

    const accountText = [
        snapshot.accountType ?? 'unknown',
        snapshot.accountEmail ? `(${snapshot.accountEmail})` : ''
    ].filter(Boolean).join(' ');

    const planText = snapshot.planType ?? 'unknown';
    const creditsText = snapshot.creditsBalance ?? 'unknown';

    const loginPreview = loginStatusPreview;
    const queueSnapshot = opts.queueSnapshot;
    const queuePending = queueSnapshot?.pendingCount ?? 0;
    const queueInProgress = queueSnapshot?.inQueue ?? false;
    const queueTaskRunning = queueSnapshot?.taskRunning ?? false;
    const queueNextPreview = queueSnapshot?.nextPreview ? toSingleLinePreview(queueSnapshot.nextPreview) : '';

    const lines = [
        'Codex status',
        `- Mode: ${opts.mode}`,
        `- Session: ${opts.sessionId ?? 'not established'}`,
        `- Permission mode: ${opts.permissionMode ?? 'default'}`,
        `- Collaboration mode: ${opts.collaborationMode ?? 'default'}`,
        `- Queue pending: ${queuePending}`,
        `- In queue: ${formatBoolean(queueInProgress)}`,
        `- Task running: ${formatBoolean(queueTaskRunning)}`,
        `- CLI version: ${versionPreview || 'unknown'}`,
        `- Account: ${accountText}`,
        `- Plan: ${planText}`,
        `- Auth method: ${snapshot.authMethod ?? 'unknown'}`,
        `- Requires OpenAI auth: ${formatBoolean(snapshot.requiresOpenaiAuth)}`,
        `- Credits balance: ${creditsText}`,
        `- Credits available: ${formatBoolean(snapshot.creditsHasCredits)}`,
        `- Credits unlimited: ${formatBoolean(snapshot.creditsUnlimited)}`,
        `- Rate limit (primary): ${formatUsageWindow(snapshot.primaryUsedPercent, snapshot.primaryResetsAt)}`,
        `- Rate limit (secondary): ${formatUsageWindow(snapshot.secondaryUsedPercent, snapshot.secondaryResetsAt)}`,
        `- Config model: ${snapshot.model ?? 'unknown'}`,
        `- codex login status: ${loginPreview}`
    ];

    if (queueNextPreview) {
        lines.push(`- Next queued message: ${queueNextPreview}`);
    }

    if (nativeWarnings) {
        lines.push(`- Native status warnings: ${nativeWarnings}`);
    }

    return lines.join('\n');
}
