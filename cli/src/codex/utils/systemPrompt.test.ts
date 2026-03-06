import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TITLE_INSTRUCTION, buildCodexSystemPrompt } from './systemPrompt';

describe('TITLE_INSTRUCTION', () => {
    let tempRoot: string;
    let previousHapiHome: string | undefined;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'codex-system-prompt-'));
        previousHapiHome = process.env.HAPI_HOME;
    });

    afterEach(() => {
        if (previousHapiHome === undefined) {
            delete process.env.HAPI_HOME;
        } else {
            process.env.HAPI_HOME = previousHapiHome;
        }
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('includes report screenshot storage hygiene rules', () => {
        expect(TITLE_INSTRUCTION).toContain('Never save screenshots under the project/workspace directory.');
        expect(TITLE_INSTRUCTION).toContain('$HAPI_HOME/tmp/report-assets/<session-or-task-id>/');
        expect(TITLE_INSTRUCTION).toContain('When screenshot tools support "filename"/"save_as", pass the full path explicitly.');
    });

    it('returns empty system prompt when pure context mode is enabled', () => {
        const workspace = join(tempRoot, 'workspace');
        const hapiHome = join(tempRoot, 'hapi-home');
        mkdirSync(workspace, { recursive: true });
        mkdirSync(hapiHome, { recursive: true });
        process.env.HAPI_HOME = hapiHome;
        writeFileSync(
            join(hapiHome, 'settings.json'),
            JSON.stringify({ pureContextMode: true }, null, 2)
        );

        const prompt = buildCodexSystemPrompt(workspace);
        expect(prompt).toBe('');
    });
});
