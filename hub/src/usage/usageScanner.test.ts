import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'bun:test'
import { scanUsageOverview } from './usageScanner'

async function writeJsonl(filePath: string, lines: unknown[]): Promise<void> {
    const content = `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
    await writeFile(filePath, content, 'utf8')
}

describe('scanUsageOverview', () => {
    it('aggregates Claude + Codex usage and deduplicates repeated Codex token_count events', async () => {
        const nowMs = Date.parse('2026-02-23T00:00:00.000Z')
        const root = await mkdtemp(join(tmpdir(), 'hapi-usage-'))

        const claudeProjectsDir = join(root, 'claude', 'projects')
        const codexSessionsDir = join(root, 'codex', 'sessions', '2026', '02', '23')
        await mkdir(claudeProjectsDir, { recursive: true })
        await mkdir(codexSessionsDir, { recursive: true })

        await writeJsonl(join(claudeProjectsDir, 'session-a.jsonl'), [
            {
                type: 'assistant',
                timestamp: '2026-02-20T00:00:00.000Z',
                message: {
                    role: 'assistant',
                    usage: {
                        input_tokens: 100,
                        output_tokens: 20,
                        cache_read_input_tokens: 40,
                        cache_creation_input_tokens: 30
                    }
                }
            },
            {
                type: 'assistant',
                timestamp: '2025-12-01T00:00:00.000Z',
                message: {
                    role: 'assistant',
                    usage: {
                        input_tokens: 10,
                        output_tokens: 5
                    }
                }
            }
        ])

        await writeJsonl(join(codexSessionsDir, 'session-b.jsonl'), [
            {
                type: 'turn_context',
                timestamp: '2026-02-21T10:00:00.000Z',
                payload: {
                    turn_id: 'turn-1',
                    model: 'gpt-5.3-codex'
                }
            },
            {
                type: 'event_msg',
                timestamp: '2026-02-21T10:00:01.000Z',
                payload: {
                    type: 'token_count',
                    info: {
                        last_token_usage: {
                            input_tokens: 50,
                            cached_input_tokens: 10,
                            output_tokens: 5,
                            reasoning_output_tokens: 2,
                            total_tokens: 55
                        }
                    },
                    rate_limits: {
                        limit_id: 'codex'
                    }
                }
            },
            {
                type: 'event_msg',
                timestamp: '2026-02-21T10:00:01.000Z',
                payload: {
                    type: 'token_count',
                    info: {
                        last_token_usage: {
                            input_tokens: 50,
                            cached_input_tokens: 10,
                            output_tokens: 5,
                            reasoning_output_tokens: 2,
                            total_tokens: 55
                        }
                    },
                    rate_limits: {
                        limit_id: 'codex_bengalfox'
                    }
                }
            },
            {
                type: 'event_msg',
                timestamp: '2026-02-22T10:00:01.000Z',
                payload: {
                    type: 'token_count',
                    info: {
                        total_token_usage: {
                            input_tokens: 120,
                            cached_input_tokens: 20,
                            output_tokens: 15,
                            reasoning_output_tokens: 5,
                            total_tokens: 135
                        }
                    }
                }
            }
        ])

        const overview = await scanUsageOverview({
            now: nowMs,
            claudeProjectsDirs: [claudeProjectsDir],
            codexSessionsDirs: [join(root, 'codex', 'sessions')]
        })

        expect(overview.windowDays).toBe(30)

        expect(overview.claude.filesScanned).toBe(1)
        expect(overview.claude.eventCount).toBe(2)
        expect(overview.claude.last30DaysEventCount).toBe(1)
        expect(overview.claude.allTime.inputTokens).toBe(110)
        expect(overview.claude.allTime.outputTokens).toBe(25)
        expect(overview.claude.allTime.cacheReadTokens).toBe(40)
        expect(overview.claude.allTime.cacheCreationTokens).toBe(30)
        expect(overview.claude.allTime.totalTokens).toBe(205)
        expect(overview.claude.last30Days.totalTokens).toBe(190)
        expect(overview.claude.models.length).toBe(1)
        expect(overview.claude.models[0]?.model).toBe('unknown')
        expect(overview.claude.models[0]?.allTime.totalTokens).toBe(205)

        expect(overview.codex.filesScanned).toBe(1)
        expect(overview.codex.eventCount).toBe(2)
        expect(overview.codex.last30DaysEventCount).toBe(2)
        expect(overview.codex.allTime.inputTokens).toBe(120)
        expect(overview.codex.allTime.cachedInputTokens).toBe(20)
        expect(overview.codex.allTime.outputTokens).toBe(15)
        expect(overview.codex.allTime.reasoningOutputTokens).toBe(5)
        expect(overview.codex.allTime.totalTokens).toBe(135)
        expect(overview.codex.models.length).toBe(1)
        expect(overview.codex.models[0]?.model).toBe('gpt-5.3-codex')
        expect(overview.codex.models[0]?.allTime.totalTokens).toBe(135)
    })

    it('marks provider unavailable when usage directories do not exist', async () => {
        const overview = await scanUsageOverview({
            now: Date.parse('2026-02-23T00:00:00.000Z'),
            claudeProjectsDirs: ['/tmp/does-not-exist-claude'],
            codexSessionsDirs: ['/tmp/does-not-exist-codex']
        })

        expect(overview.claude.available).toBe(false)
        expect(overview.codex.available).toBe(false)
        expect(overview.claude.eventCount).toBe(0)
        expect(overview.codex.eventCount).toBe(0)
        expect(overview.claude.models.length).toBe(0)
        expect(overview.codex.models.length).toBe(0)
    })
})
