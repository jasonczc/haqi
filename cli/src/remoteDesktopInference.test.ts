import { describe, expect, it } from 'vitest'
import { inferRemoteDesktopMetadata } from '@hapi/protocol/remoteDesktop'

describe('inferRemoteDesktopMetadata', () => {
    it('detects noVNC from URL hint', () => {
        expect(
            inferRemoteDesktopMetadata([
                { id: 'a', port: 6080, url: 'http://127.0.0.1:6080/vnc.html', name: 'preview:6080' }
            ])
        ).toEqual({
            kind: 'novnc',
            novncUrl: 'http://127.0.0.1:6080/vnc.html',
            previewTargetId: 'a',
            label: 'preview:6080'
        })
    })

    it('detects raw VNC port binding with warning', () => {
        expect(
            inferRemoteDesktopMetadata([{ id: 'b', port: 5900, url: 'http://127.0.0.1:5900', name: 'preview:5900' }])
        ).toEqual({
            kind: 'vnc-raw',
            warnHttpUrl: true,
            novncUrl: 'http://127.0.0.1:5900',
            previewTargetId: 'b',
            label: 'preview:5900'
        })
    })

    it('returns undefined when no match', () => {
        expect(inferRemoteDesktopMetadata([{ id: 'c', port: 3000, url: 'http://127.0.0.1:3000' }])).toBeUndefined()
    })
})
