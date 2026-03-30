import { z } from 'zod'
import type { PreviewTarget } from './schemas'

/** Declared when Runner or Hub derives a browser-openable desktop from preview port metadata (e.g. noVNC). */
export const RemoteDesktopMetadataSchema = z.object({
    kind: z.enum(['novnc', 'vnc-raw']),
    /** Full http(s) URL to noVNC (or websockify HTML); safe to embed in an iframe when same-origin or CORS permits. */
    novncUrl: z.string().optional(),
    /**
     * When only an VNC TCP port is exposed as HTTP (unusual), `url` may still point at http://host:5900 — browsers cannot speak RFB.
     * UI shows a warning instead of embedding.
     */
    warnHttpUrl: z.boolean().optional(),
    /** Optional `preview:*` binding used to derive this entry. */
    previewTargetId: z.string().optional(),
    /** Human-readable label from PreviewTarget.name when present. */
    label: z.string().optional()
})

export type RemoteDesktopMetadata = z.infer<typeof RemoteDesktopMetadataSchema>

const NOVNC_HINT = /novnc|vnc\.html|websockify/i

export function inferRemoteDesktopMetadata(previewUrls: PreviewTarget[] | undefined): RemoteDesktopMetadata | undefined {
    if (!previewUrls?.length) {
        return undefined
    }

    const byHint = previewUrls.find((target) => {
        const url = target.url ?? ''
        const name = target.name ?? ''
        return NOVNC_HINT.test(url) || NOVNC_HINT.test(name)
    })
    if (byHint?.url) {
        return {
            kind: 'novnc',
            novncUrl: byHint.url,
            previewTargetId: byHint.id,
            label: byHint.name
        }
    }

    const vncPort = previewUrls.find((target) => {
        if (target.port === 5900) {
            return true
        }
        const fromName = target.name?.match(/^preview:(\d+)$/)
        return fromName?.[1] === '5900' || /\b5900\b/.test(target.name ?? '')
    })
    if (vncPort?.url) {
        return {
            kind: 'vnc-raw',
            warnHttpUrl: true,
            novncUrl: vncPort.url,
            previewTargetId: vncPort.id,
            label: vncPort.name
        }
    }

    return undefined
}
