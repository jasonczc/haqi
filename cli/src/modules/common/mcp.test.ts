import { describe, expect, it } from 'vitest';
import {
    parseClaudeMcpListOutput,
    parseCodexMcpListOutput,
    parseGeminiMcpListOutput
} from './mcp';

describe('mcp parsing', () => {
    it('parses codex mcp table output', () => {
        const output = [
            'Name    Command  Args                                      Env  Cwd  Status   Auth       ',
            'notion  npx      -y mcp-remote https://mcp.notion.com/mcp  -    -    enabled  Unsupported'
        ].join('\n');

        const servers = parseCodexMcpListOutput(output);
        expect(servers).toHaveLength(1);
        expect(servers[0]).toMatchObject({
            name: 'notion',
            available: true,
            enabled: true,
            transport: 'http',
            source: 'cli-config'
        });
    });

    it('parses claude mcp health output', () => {
        const output = [
            'Checking MCP server health...',
            '',
            'readx: https://readx.cc/mcp?apikey=demo (HTTP) - ✓ Connected',
            'shadcn: npx shadcn@latest mcp - ✓ Connected'
        ].join('\n');

        const servers = parseClaudeMcpListOutput(output);
        expect(servers).toHaveLength(2);
        expect(servers[0]).toMatchObject({
            name: 'readx',
            available: true,
            connected: true,
            source: 'cli-config'
        });
        expect(servers[1]).toMatchObject({
            name: 'shadcn',
            available: true,
            connected: true,
            source: 'cli-config'
        });
    });

    it('returns empty list for gemini when no servers configured', () => {
        const output = [
            'Loaded cached credentials.',
            'No MCP servers configured.'
        ].join('\n');

        const servers = parseGeminiMcpListOutput(output);
        expect(servers).toEqual([]);
    });
});
