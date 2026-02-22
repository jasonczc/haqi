import { describe, expect, it } from 'vitest';
import { ReasoningProcessor, type ReasoningOutput } from './reasoningProcessor';

function createHarness() {
    const events: ReasoningOutput[] = [];
    const processor = new ReasoningProcessor((message) => {
        events.push(message as ReasoningOutput);
    });
    return { processor, events };
}

describe('ReasoningProcessor', () => {
    it('emits reasoning text for title-only reasoning sections', () => {
        const { processor, events } = createHarness();

        processor.processDelta('**Inspecting attachment type**');
        processor.complete('**Inspecting attachment type**');

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: 'reasoning',
            message: 'Inspecting attachment type'
        });
    });

    it('emits CodexReasoning tool-call and result when body content exists', () => {
        const { processor, events } = createHarness();

        processor.processDelta('**Inspecting attachment type**\nNeed to confirm upload payload format.');
        processor.complete('**Inspecting attachment type**\nNeed to confirm upload payload format.');

        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            type: 'tool-call',
            name: 'CodexReasoning',
            input: {
                title: 'Inspecting attachment type'
            }
        });
        expect(events[1]).toMatchObject({
            type: 'tool-call-result',
            output: {
                content: 'Need to confirm upload payload format.',
                status: 'completed'
            }
        });
    });
});
