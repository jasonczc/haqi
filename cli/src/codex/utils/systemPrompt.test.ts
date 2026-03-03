import { describe, expect, it } from 'vitest';
import { TITLE_INSTRUCTION } from './systemPrompt';

describe('TITLE_INSTRUCTION', () => {
    it('includes report screenshot storage hygiene rules', () => {
        expect(TITLE_INSTRUCTION).toContain('Never save screenshots under the project/workspace directory.');
        expect(TITLE_INSTRUCTION).toContain('$HAPI_HOME/tmp/report-assets/<session-or-task-id>/');
        expect(TITLE_INSTRUCTION).toContain('When screenshot tools support "filename"/"save_as", pass the full path explicitly.');
    });
});
