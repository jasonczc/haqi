import type { ArchiveDetail } from '@hapi/protocol/schemas'
import { logger } from '@/ui/logger'

// Best-effort hub notification when a runner-spawned child exits abnormally
// after registering its session webhook. We never let a failing POST escalate
// into worker instability — every error is logged and swallowed.
export async function reportCrashToHub(params: {
    hubUrl: string
    authToken: string
    sessionId: string
    detail: ArchiveDetail
}): Promise<void> {
    const { hubUrl, authToken, sessionId, detail } = params
    if (!hubUrl || !authToken) {
        logger.debug('[reportCrash] skipping — no hubUrl/authToken available')
        return
    }
    const url = `${hubUrl.replace(/\/$/, '')}/api/sessions/${encodeURIComponent(sessionId)}/crash-report`
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${authToken}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify(detail)
        })
        if (!res.ok) {
            const text = await res.text().catch(() => '')
            logger.debug(`[reportCrash] hub rejected report (${res.status}): ${text.slice(0, 200)}`)
            return
        }
        logger.debug(`[reportCrash] hub accepted crash report for session ${sessionId.slice(0, 8)}`)
    } catch (err) {
        logger.debug('[reportCrash] failed to post crash report', err)
    }
}
