import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    REPORT_INSTRUCTION,
    TITLE_INSTRUCTION,
    buildCodexSystemPrompt,
    getCodexSystemPrompt,
} from './systemPrompt';

describe('systemPrompt', () => {
    let tempRoot: string;
    let previousHapiHome: string | undefined;
    let previousEnableReportPrompt: string | undefined;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'codex-system-prompt-'));
        previousHapiHome = process.env.HAPI_HOME;
        previousEnableReportPrompt = process.env.HAPI_CODEX_ENABLE_REPORT_PROMPT;
        delete process.env.HAPI_CODEX_ENABLE_REPORT_PROMPT;
    });

    afterEach(() => {
        if (previousHapiHome === undefined) {
            delete process.env.HAPI_HOME;
        } else {
            process.env.HAPI_HOME = previousHapiHome;
        }
        if (previousEnableReportPrompt === undefined) {
            delete process.env.HAPI_CODEX_ENABLE_REPORT_PROMPT;
        } else {
            process.env.HAPI_CODEX_ENABLE_REPORT_PROMPT = previousEnableReportPrompt;
        }
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('defaults to title-only prompt without report guidance', () => {
        expect(getCodexSystemPrompt()).toBe(TITLE_INSTRUCTION);
        expect(getCodexSystemPrompt()).not.toContain('functions.haqi__report_create');
        expect(TITLE_INSTRUCTION).not.toContain('functions.haqi__report_create');
    });

    it('includes report screenshot storage hygiene rules when enabled', () => {
        process.env.HAPI_CODEX_ENABLE_REPORT_PROMPT = '1';

        const prompt = getCodexSystemPrompt();
        expect(prompt).toContain(REPORT_INSTRUCTION);
        expect(prompt).toContain('Never save screenshots under the project/workspace directory.');
        expect(prompt).toContain('$HAPI_HOME/tmp/report-assets/<session-or-task-id>/');
        expect(prompt).toContain('When screenshot tools support "filename"/"save_as", pass the full path explicitly.');
    });

    it('reads report prompt switch from settings.json when env is unset', () => {
        const workspace = join(tempRoot, 'workspace');
        const hapiHome = join(tempRoot, 'hapi-home');
        mkdirSync(workspace, { recursive: true });
        mkdirSync(hapiHome, { recursive: true });
        process.env.HAPI_HOME = hapiHome;
        writeFileSync(
            join(hapiHome, 'settings.json'),
            JSON.stringify({ codexReportPromptEnabled: true }, null, 2)
        );

        expect(getCodexSystemPrompt()).toContain(REPORT_INSTRUCTION);
    });

    it('returns empty system prompt when pure context mode is enabled', () => {
        const workspace = join(tempRoot, 'workspace');
        const hapiHome = join(tempRoot, 'hapi-home');
        mkdirSync(workspace, { recursive: true });
        mkdirSync(hapiHome, { recursive: true });
        process.env.HAPI_HOME = hapiHome;
        process.env.HAPI_CODEX_ENABLE_REPORT_PROMPT = '1';
        writeFileSync(
            join(hapiHome, 'settings.json'),
            JSON.stringify({ pureContextMode: true }, null, 2)
        );

        const prompt = buildCodexSystemPrompt(workspace);
        expect(prompt).toBe('');
    });
});
