import { describe, it, expect } from 'bun:test'
import { RecordingManager } from './recording'

describe('RecordingManager', () => {
    it('starts not recording', () => {
        const rm = new RecordingManager()
        expect(rm.isRecording()).toBe(false)
        expect(rm.status().recording).toBe(false)
    })

    it('lists empty recordings', async () => {
        const rm = new RecordingManager()
        const list = await rm.listRecordings()
        expect(Array.isArray(list)).toBe(true)
    })
})
