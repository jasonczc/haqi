import { describe, expect, it } from 'vitest'
import { HAPI_MCP_TOOL_DEFINITIONS } from './hapiMcpTools'

describe('HAPI MCP swarm tool definitions', () => {
    it('includes swarm record tools', () => {
        const names = HAPI_MCP_TOOL_DEFINITIONS.map((item) => item.name)
        expect(names).toContain('record_activity')
        expect(names).toContain('record_outcome')
        expect(names).toContain('record_artifact')
        expect(names).toContain('record_review')
        expect(names).toContain('record_effect')
    })
})
