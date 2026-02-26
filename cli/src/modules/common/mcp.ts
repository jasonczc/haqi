import { spawn } from 'node:child_process';

export type McpServerSource = 'cli-config' | 'runtime-bridge' | 'combined';

export interface McpServerSummary {
    name: string;
    status: string;
    available: boolean;
    enabled?: boolean;
    connected?: boolean;
    transport?: 'http' | 'stdio' | 'sse' | 'unknown';
    target?: string;
    auth?: string;
    source: McpServerSource;
}

export interface ListMcpServersRequest {
    flavor?: string;
}

export interface ListMcpServersResponse {
    success: boolean;
    flavor: string;
    servers?: McpServerSummary[];
    checkedAt?: number;
    warning?: string;
    error?: string;
}

type CommandSpec = {
    command: string;
    args: string[];
};

type CommandResult = {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    error?: string;
};

const MCP_LIST_TIMEOUT_MS = 12_000;

function normalizeFlavor(flavor: string | undefined): string {
    if (!flavor) {
        return 'unknown';
    }
    const normalized = flavor.trim().toLowerCase();
    return normalized.length > 0 ? normalized : 'unknown';
}

function stripAnsi(value: string): string {
    return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function parseStatus(statusRaw: string): { available: boolean; enabled?: boolean; connected?: boolean } {
    const normalized = statusRaw.trim().toLowerCase();
    if (!normalized) {
        return { available: false };
    }

    if (normalized.includes('disabled')) {
        return { available: false, enabled: false, connected: false };
    }

    if (normalized.includes('connected')) {
        return { available: true, enabled: true, connected: true };
    }

    if (normalized.includes('enabled')) {
        return { available: true, enabled: true };
    }

    if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('unavailable')) {
        return { available: false, connected: false };
    }

    return { available: false };
}

function inferTransport(target: string | undefined): 'http' | 'stdio' | 'sse' | 'unknown' {
    const normalized = target?.toLowerCase() ?? '';
    if (!normalized) {
        return 'unknown';
    }
    if (normalized.includes('http://') || normalized.includes('https://') || normalized.includes('(http)')) {
        return 'http';
    }
    if (normalized.includes('(sse)')) {
        return 'sse';
    }
    return 'stdio';
}

function parseTableRows(output: string): Array<string[]> {
    const lines = stripAnsi(output)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const rows: Array<string[]> = [];
    for (const line of lines) {
        if (/^name\s+/i.test(line)) {
            continue;
        }
        if (/^checking\s+mcp\s+server\s+health/i.test(line)) {
            continue;
        }
        if (/^loaded cached credentials\./i.test(line)) {
            continue;
        }
        if (/^no mcp servers configured\.?$/i.test(line)) {
            return [];
        }
        if (/^[-=]{3,}$/.test(line)) {
            continue;
        }

        const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter((part) => part.length > 0);
        if (parts.length >= 2) {
            rows.push(parts);
        }
    }
    return rows;
}

function buildTargetFromParts(parts: string[]): string | undefined {
    const first = parts[1];
    const second = parts[2];

    if (typeof second === 'string' && /https?:\/\//i.test(second)) {
        return second;
    }
    if (typeof first === 'string' && /https?:\/\//i.test(first)) {
        return first;
    }
    if (typeof second === 'string' && second !== '-') {
        return `${first} ${second}`.trim();
    }
    return first;
}

export function parseCodexMcpListOutput(output: string): McpServerSummary[] {
    const rows = parseTableRows(output);
    return rows.map((parts) => {
        const name = parts[0];
        const statusRaw = parts.length >= 4 ? parts[parts.length - 2] : parts[parts.length - 1];
        const status = parseStatus(statusRaw);
        const target = buildTargetFromParts(parts);
        const auth = parts.length >= 5 ? parts[parts.length - 1] : undefined;
        return {
            name,
            status: statusRaw,
            available: status.available,
            enabled: status.enabled,
            connected: status.connected,
            transport: inferTransport(target),
            target,
            auth,
            source: 'cli-config' as const
        };
    });
}

export function parseClaudeMcpListOutput(output: string): McpServerSummary[] {
    const cleaned = stripAnsi(output);
    const lines = cleaned
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const healthStyle: McpServerSummary[] = [];
    for (const line of lines) {
        if (/^checking\s+mcp\s+server\s+health/i.test(line) || /^loaded cached credentials\./i.test(line)) {
            continue;
        }
        if (/^no mcp servers configured\.?$/i.test(line)) {
            return [];
        }

        const match = line.match(/^([a-z0-9._:-]+):\s+(.+?)\s+-\s+(.+)$/i);
        if (!match) {
            continue;
        }

        const name = match[1];
        const target = match[2].trim();
        const statusRaw = match[3].trim();
        const status = parseStatus(statusRaw);

        healthStyle.push({
            name,
            status: statusRaw,
            available: status.available,
            enabled: status.enabled,
            connected: status.connected,
            transport: inferTransport(target),
            target,
            source: 'cli-config'
        });
    }

    if (healthStyle.length > 0) {
        return healthStyle;
    }

    const rows = parseTableRows(cleaned);
    return rows.map((parts) => {
        const name = parts[0];
        const statusRaw = parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 1];
        const status = parseStatus(statusRaw);
        const target = buildTargetFromParts(parts);
        const auth = parts.length >= 4 ? parts[parts.length - 1] : undefined;
        return {
            name,
            status: statusRaw,
            available: status.available,
            enabled: status.enabled,
            connected: status.connected,
            transport: inferTransport(target),
            target,
            auth,
            source: 'cli-config'
        };
    });
}

export function parseGeminiMcpListOutput(output: string): McpServerSummary[] {
    const rows = parseTableRows(output);
    if (rows.length === 0) {
        return [];
    }

    return rows.map((parts) => {
        const name = parts[0];
        const statusRaw = parts.length >= 2 ? parts[parts.length - 1] : 'unknown';
        const status = parseStatus(statusRaw);
        const target = buildTargetFromParts(parts);
        return {
            name,
            status: statusRaw,
            available: status.available,
            enabled: status.enabled,
            connected: status.connected,
            transport: inferTransport(target),
            target,
            source: 'cli-config'
        };
    });
}

function runtimeBridgeServers(flavor: string): McpServerSummary[] {
    if (flavor === 'codex') {
        return [
            {
                name: 'haqi',
                status: 'runtime bridge active',
                available: true,
                enabled: true,
                connected: true,
                transport: 'stdio',
                source: 'runtime-bridge'
            },
            {
                name: 'hapi',
                status: 'runtime bridge active',
                available: true,
                enabled: true,
                connected: true,
                transport: 'stdio',
                source: 'runtime-bridge'
            }
        ];
    }

    if (flavor === 'claude') {
        return [
            {
                name: 'haqi',
                status: 'runtime bridge active',
                available: true,
                enabled: true,
                connected: true,
                transport: 'http',
                source: 'runtime-bridge'
            },
            {
                name: 'hapi',
                status: 'runtime bridge active',
                available: true,
                enabled: true,
                connected: true,
                transport: 'http',
                source: 'runtime-bridge'
            }
        ];
    }

    return [];
}

function mergeServers(configured: McpServerSummary[], runtime: McpServerSummary[]): McpServerSummary[] {
    const map = new Map<string, McpServerSummary>();

    for (const server of configured) {
        map.set(server.name.toLowerCase(), server);
    }

    for (const runtimeServer of runtime) {
        const key = runtimeServer.name.toLowerCase();
        const existing = map.get(key);
        if (!existing) {
            map.set(key, runtimeServer);
            continue;
        }

        map.set(key, {
            ...existing,
            available: existing.available || runtimeServer.available,
            enabled: existing.enabled ?? runtimeServer.enabled,
            connected: existing.connected ?? runtimeServer.connected,
            source: 'combined',
            status: existing.status || runtimeServer.status,
            transport: existing.transport ?? runtimeServer.transport
        });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function commandForFlavor(flavor: string): CommandSpec | null {
    if (flavor === 'codex') {
        return { command: 'codex', args: ['mcp', 'list'] };
    }
    if (flavor === 'claude') {
        return { command: 'claude', args: ['mcp', 'list'] };
    }
    if (flavor === 'gemini') {
        return { command: 'gemini', args: ['mcp', 'list'] };
    }
    return null;
}

async function runCommand(spec: CommandSpec): Promise<CommandResult> {
    return await new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let settled = false;

        const child = spawn(spec.command, spec.args, {
            cwd: process.cwd(),
            env: process.env
        });

        const finish = (result: CommandResult) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };

        const timeout = setTimeout(() => {
            if (!child.killed) {
                child.kill('SIGTERM');
            }
            finish({
                success: false,
                stdout,
                stderr,
                exitCode: null,
                error: `Command timed out after ${MCP_LIST_TIMEOUT_MS}ms`
            });
        }, MCP_LIST_TIMEOUT_MS);

        child.stdout.on('data', (chunk: Buffer | string) => {
            stdout += String(chunk);
        });
        child.stderr.on('data', (chunk: Buffer | string) => {
            stderr += String(chunk);
        });
        child.on('error', (error) => {
            clearTimeout(timeout);
            finish({
                success: false,
                stdout,
                stderr,
                exitCode: null,
                error: error.message
            });
        });
        child.on('close', (code) => {
            clearTimeout(timeout);
            finish({
                success: code === 0,
                stdout,
                stderr,
                exitCode: code
            });
        });
    });
}

export async function collectMcpServersForFlavor(flavorInput: string): Promise<{
    flavor: string;
    servers: McpServerSummary[];
    warning?: string;
    commandFailed: boolean;
}> {
    const flavor = normalizeFlavor(flavorInput);
    const runtimeServers = runtimeBridgeServers(flavor);
    const spec = commandForFlavor(flavor);

    if (!spec) {
        return {
            flavor,
            servers: mergeServers([], runtimeServers),
            commandFailed: false
        };
    }

    const commandResult = await runCommand(spec);
    let configuredServers: McpServerSummary[] = [];
    let warning: string | undefined;

    if (commandResult.stdout.trim().length > 0) {
        if (flavor === 'codex') {
            configuredServers = parseCodexMcpListOutput(commandResult.stdout);
        } else if (flavor === 'claude') {
            configuredServers = parseClaudeMcpListOutput(commandResult.stdout);
        } else if (flavor === 'gemini') {
            configuredServers = parseGeminiMcpListOutput(commandResult.stdout);
        }
    }

    const commandFailed = !commandResult.success && configuredServers.length === 0;
    if (commandFailed) {
        const stderr = commandResult.stderr.trim();
        const base = commandResult.error ?? stderr ?? `Command failed with exit code ${commandResult.exitCode ?? 'unknown'}`;
        warning = `Failed to inspect MCP via ${spec.command}: ${base}`;
    }

    return {
        flavor,
        servers: mergeServers(configuredServers, runtimeServers),
        warning,
        commandFailed
    };
}
