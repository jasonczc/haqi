import { request } from 'node:http';

function logError(message: string, error?: unknown): void {
    const detail = error instanceof Error ? error.message : (error ? String(error) : '');
    const suffix = detail ? `: ${detail}` : '';
    process.stderr.write(`[hook-forwarder] ${message}${suffix}\n`);
}

function parsePort(value: string | undefined): number | null {
    if (!value) {
        return null;
    }

    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return null;
    }

    return port;
}

function parseArgs(args: string[]): { port: number | null; token: string | null } {
    let port: number | null = null;
    let token: string | null = null;

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (!arg) {
            continue;
        }

        if (arg === '--port' || arg === '-p') {
            port = parsePort(args[i + 1]);
            i += 1;
            continue;
        }

        if (arg.startsWith('--port=')) {
            port = parsePort(arg.slice('--port='.length));
            continue;
        }

        if (arg === '--token' || arg === '-t') {
            token = args[i + 1] ?? null;
            i += 1;
            continue;
        }

        if (arg.startsWith('--token=')) {
            token = arg.slice('--token='.length);
            continue;
        }

        if (!port) {
            port = parsePort(arg);
            continue;
        }

        if (!token) {
            token = arg;
        }
    }

    return { port, token };
}

export async function runSessionHookForwarder(args: string[]): Promise<void> {
    const { port, token } = parseArgs(args);
    if (!port) {
        logError('Invalid or missing port argument');
        process.exitCode = 1;
        return;
    }

    if (!token) {
        logError('Missing hook token');
        process.exitCode = 1;
        return;
    }

    try {
        const chunks: Buffer[] = [];
        process.stdin.resume();
        for await (const chunk of process.stdin) {
            if (typeof chunk === 'string') {
                chunks.push(Buffer.from(chunk));
            } else {
                chunks.push(chunk as Buffer);
            }
        }

        const body = Buffer.concat(chunks);

        let exitCode = 0;
        await new Promise<void>((resolve) => {
            const req = request({
                host: '127.0.0.1',
                port,
                method: 'POST',
                path: '/hook/claude',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': body.length,
                    'x-hapi-hook-token': token
                }
            }, (res) => {
                const responseChunks: Buffer[] = [];
                if (res.statusCode && res.statusCode >= 400) {
                    exitCode = 1;
                    logError(`Hook server responded with status ${res.statusCode}`);
                }
                res.on('data', (chunk) => responseChunks.push(chunk as Buffer));
                res.on('error', (error) => {
                    exitCode = 1;
                    logError('Error reading hook server response', error);
                    resolve();
                });
                res.on('end', () => {
                    if (!res.statusCode || res.statusCode < 400) {
                        const responseBody = Buffer.concat(responseChunks).toString('utf-8').trim();
                        if (responseBody) {
                            try {
                                const parsed = JSON.parse(responseBody) as {
                                    exit_code?: unknown;
                                    stdout?: unknown;
                                    stderr?: unknown;
                                };
                                if (typeof parsed.stdout === 'string') {
                                    process.stdout.write(parsed.stdout);
                                }
                                if (typeof parsed.stderr === 'string') {
                                    process.stderr.write(parsed.stderr);
                                }
                                if (Number.isInteger(parsed.exit_code)) {
                                    exitCode = parsed.exit_code as number;
                                }
                            } catch (error) {
                                exitCode = 1;
                                logError('Failed to parse hook server response', error);
                            }
                        }
                    }
                    resolve();
                });
            });

            req.on('error', (error) => {
                exitCode = 1;
                logError('Failed to send hook request', error);
                resolve();
            });
            req.end(body);
        });
        process.exitCode = exitCode;
    } catch (error) {
        logError('Failed to forward session hook', error);
        process.exitCode = 1;
    }
}
