import { describe, expect, it } from 'bun:test'
import type { Database } from 'bun:sqlite'

import { Store } from '../../store'
import { createPublicReportsRoutes } from './publicReports'

function closeStore(store: Store): void {
    const db = (store as unknown as { db: Database }).db
    db.close()
}

describe('public report markdown rendering', () => {
    it('renders GFM markdown blocks with marked', async () => {
        const store = new Store(':memory:')

        const report = store.reports.createReport({
            namespace: 'default',
            title: 'Markdown Feature Report',
            markdown: [
                '# Heading',
                '',
                '> quote line',
                '',
                '| A | B |',
                '| --- | --- |',
                '| 1 | 2 |',
                '',
                '- [x] done',
                '- [ ] todo',
                '',
                '~~strike~~'
            ].join('\n')
        })
        const share = store.reports.createShare({
            reportId: report.id,
            namespace: 'default'
        })

        const app = createPublicReportsRoutes({
            store,
            reportsStorageDir: '/tmp'
        })
        const response = await app.request(`http://localhost/share/r/${share.token}`)
        const html = await response.text()

        expect(response.status).toBe(200)
        expect(html).toContain('<table>')
        expect(html).toContain('<blockquote>')
        expect(html).toContain('<del>strike</del>')
        expect(html).toContain('type="checkbox"')

        closeStore(store)
    })

    it('sanitizes raw html and unsafe links while preserving asset links', async () => {
        const store = new Store(':memory:')

        const report = store.reports.createReport({
            namespace: 'default',
            title: 'Sanitize Report',
            markdown: [
                '<script>alert(1)</script>',
                '',
                '[bad](javascript:alert(1))',
                '',
                '![shot](asset://asset-123)'
            ].join('\n')
        })
        const share = store.reports.createShare({
            reportId: report.id,
            namespace: 'default'
        })

        const app = createPublicReportsRoutes({
            store,
            reportsStorageDir: '/tmp'
        })
        const response = await app.request(`http://localhost/share/r/${share.token}`)
        const html = await response.text()

        expect(response.status).toBe(200)
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
        expect(html).toContain('<a href="#">bad</a>')
        expect(html).toContain(`/share/r/${share.token}/assets/asset-123`)

        closeStore(store)
    })
})
