import { describe, expect, it } from 'vitest'
import { decodePathLink, encodePathLink, isOutsideWorkspacePathCandidate, isYoloPermissionMode } from '@/lib/pathLinks'

describe('pathLinks', () => {
    it('encodes and decodes path links', () => {
        const path = '../foo/bar baz.png'
        const href = encodePathLink(path)
        expect(href.startsWith('hapi-file://')).toBe(true)
        expect(decodePathLink(href)).toBe(path)
    })

    it('detects outside-workspace path candidates', () => {
        expect(isOutsideWorkspacePathCandidate('/tmp/a.txt')).toBe(true)
        expect(isOutsideWorkspacePathCandidate('../a.txt')).toBe(true)
        expect(isOutsideWorkspacePathCandidate('src/../a.txt')).toBe(true)
        expect(isOutsideWorkspacePathCandidate('src/a.txt')).toBe(false)
        expect(isOutsideWorkspacePathCandidate('./src/a.txt')).toBe(false)
    })

    it('matches yolo-like permission modes', () => {
        expect(isYoloPermissionMode('yolo')).toBe(true)
        expect(isYoloPermissionMode('bypassPermissions')).toBe(true)
        expect(isYoloPermissionMode('auto-approve')).toBe(true)
        expect(isYoloPermissionMode('default')).toBe(false)
        expect(isYoloPermissionMode(undefined)).toBe(false)
    })
})
