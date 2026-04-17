import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DaemonComputerUseRuntime } from './runtime';

type FetchArgs = { url: string; init: RequestInit | undefined };

function makeFetchSpy(response: Response): {
    mock: typeof fetch;
    calls: FetchArgs[];
} {
    const calls: FetchArgs[] = [];
    const mock = (async (input: any, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return response;
    }) as unknown as typeof fetch;
    return { mock, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

describe('DaemonComputerUseRuntime route table', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('uses POST /desktop/screenshot and returns screenshot outcome', async () => {
        const { mock, calls } = makeFetchSpy(jsonResponse({ image: 'AAAA', width: 100, height: 50 }));
        globalThis.fetch = mock;
        const runtime = new DaemonComputerUseRuntime('http://fake');
        const outcome = await runtime.execute({ kind: 'screenshot' });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://fake/desktop/screenshot');
        expect(calls[0].init?.method).toBe('POST');
        expect(outcome).toEqual({ kind: 'screenshot', imageBase64: 'AAAA', width: 100, height: 50 });
    });

    it('uses GET /desktop/cursor without a body and returns coordinates', async () => {
        const { mock, calls } = makeFetchSpy(jsonResponse({ x: 42, y: 99 }));
        globalThis.fetch = mock;
        const runtime = new DaemonComputerUseRuntime('http://fake');
        const outcome = await runtime.execute({ kind: 'cursor_position' });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://fake/desktop/cursor');
        expect(calls[0].init?.method).toBe('GET');
        expect(calls[0].init?.body).toBeUndefined();
        expect(outcome).toEqual({ kind: 'cursor_position', x: 42, y: 99 });
    });

    it('uses POST /desktop/open-browser (not /desktop/browser) and returns ok', async () => {
        const { mock, calls } = makeFetchSpy(jsonResponse({}));
        globalThis.fetch = mock;
        const runtime = new DaemonComputerUseRuntime('http://fake');
        const outcome = await runtime.execute({ kind: 'open_browser', url: 'https://x.test' });
        expect(calls[0].url).toBe('http://fake/desktop/open-browser');
        expect(calls[0].init?.method).toBe('POST');
        expect(JSON.parse(calls[0].init!.body as string)).toEqual({ url: 'https://x.test' });
        expect(outcome).toEqual({ kind: 'ok' });
    });

    it('routes click/type/key/scroll via POST with stripped kind', async () => {
        const { mock, calls } = makeFetchSpy(jsonResponse({}));
        globalThis.fetch = mock;
        const runtime = new DaemonComputerUseRuntime('http://fake');

        await runtime.execute({ kind: 'click', x: 1, y: 2, button: 'right' });
        await runtime.execute({ kind: 'type', text: 'hi' });
        await runtime.execute({ kind: 'key', key: 'Return' });
        await runtime.execute({ kind: 'scroll', direction: 'down', clicks: 3 });

        expect(calls.map((c) => c.url)).toEqual([
            'http://fake/desktop/click',
            'http://fake/desktop/type',
            'http://fake/desktop/key',
            'http://fake/desktop/scroll'
        ]);
        for (const c of calls) {
            expect(c.init?.method).toBe('POST');
            const body = JSON.parse(c.init!.body as string);
            expect(body).not.toHaveProperty('kind');
        }
    });

    it('surfaces daemon HTTP error body as outcome.message', async () => {
        const { mock } = makeFetchSpy(new Response(JSON.stringify({ error: 'daemon dead' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        }));
        globalThis.fetch = mock;
        const runtime = new DaemonComputerUseRuntime('http://fake');
        const outcome = await runtime.execute({ kind: 'click', x: 0, y: 0 });
        expect(outcome).toEqual({ kind: 'error', action: 'click', message: 'daemon dead' });
    });

    it('honors HAQI_DAEMON_URL env as default base', async () => {
        const prev = process.env.HAQI_DAEMON_URL;
        process.env.HAQI_DAEMON_URL = 'http://env-daemon:9999';
        try {
            const { mock, calls } = makeFetchSpy(jsonResponse({ image: 'a', width: 1, height: 1 }));
            globalThis.fetch = mock;
            const runtime = new DaemonComputerUseRuntime();
            await runtime.execute({ kind: 'screenshot' });
            expect(calls[0].url).toBe('http://env-daemon:9999/desktop/screenshot');
        } finally {
            if (prev === undefined) delete process.env.HAQI_DAEMON_URL;
            else process.env.HAQI_DAEMON_URL = prev;
        }
    });
});

describe('DaemonComputerUseRuntime.getDisplayInfo', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('caches display info across calls', async () => {
        const { mock, calls } = makeFetchSpy(jsonResponse({ image: 'a', width: 800, height: 600 }));
        globalThis.fetch = mock;
        const runtime = new DaemonComputerUseRuntime('http://fake');
        const first = await runtime.getDisplayInfo();
        const second = await runtime.getDisplayInfo();
        expect(first).toEqual({ width: 800, height: 600 });
        expect(second).toEqual({ width: 800, height: 600 });
        expect(calls).toHaveLength(1);
    });

    it('falls back to 1280x720 when daemon errors on probe', async () => {
        const { mock } = makeFetchSpy(new Response('{}', { status: 500 }));
        globalThis.fetch = mock;
        const runtime = new DaemonComputerUseRuntime('http://fake');
        expect(await runtime.getDisplayInfo()).toEqual({ width: 1280, height: 720 });
    });
});
