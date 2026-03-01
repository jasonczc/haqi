import { Hono } from 'hono'
import { join } from 'node:path'
import { marked, type Tokens } from 'marked'

import type { Store, StoredReportAsset, StoredReportShare } from '../../store'

function escapeHtml(input: unknown): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function isShareActive(share: StoredReportShare): boolean {
    if (share.revokedAt !== null) {
        return false
    }
    if (share.expiresAt !== null && Date.now() > share.expiresAt) {
        return false
    }
    return true
}

function sanitizeLink(rawUrl: string, resolveAssetUrl: (assetId: string) => string): string {
    const trimmed = rawUrl.trim()
    if (!trimmed) {
        return '#'
    }

    if (trimmed.startsWith('asset://')) {
        const assetId = trimmed.slice('asset://'.length).trim()
        if (!assetId) {
            return '#'
        }
        return resolveAssetUrl(assetId)
    }

    if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
        return trimmed
    }

    try {
        const parsed = new URL(trimmed)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
            return parsed.toString()
        }
        return '#'
    } catch {
        return '#'
    }
}

function renderMarkdown(markdown: string, resolveAssetUrl: (assetId: string) => string): string {
    const renderer = new marked.Renderer()
    const defaultLink = renderer.link.bind(renderer)
    const defaultImage = renderer.image.bind(renderer)

    renderer.link = (token: Tokens.Link) => {
        const href = sanitizeLink(token.href, resolveAssetUrl)
        return defaultLink({ ...token, href })
    }

    renderer.image = (token: Tokens.Image) => {
        const href = sanitizeLink(token.href, resolveAssetUrl)
        return defaultImage({ ...token, href })
    }

    renderer.html = (token: Tokens.HTML | Tokens.Tag) => escapeHtml(token.text)

    return marked.parse(markdown, {
        async: false,
        gfm: true,
        breaks: true,
        renderer
    })
}

function reportAssetPath(root: string, reportId: string, storageKey: string): string {
    return join(root, reportId, storageKey)
}

function toPublicAssetUrl(token: string, assetId: string): string {
    return `/share/r/${encodeURIComponent(token)}/assets/${encodeURIComponent(assetId)}`
}

function buildSharePageHtml(options: {
    token: string
    title: string
    status: string
    updatedAt: number
    markdown: string
    assets: StoredReportAsset[]
}): string {
    const usedAssetIds = new Set<string>()
    const markdownHtml = renderMarkdown(options.markdown, (assetId) => {
        usedAssetIds.add(assetId)
        return toPublicAssetUrl(options.token, assetId)
    })

    const extraAssets = options.assets.filter((asset) => !usedAssetIds.has(asset.id))
    const extraAssetsHtml = extraAssets.length > 0
        ? `<section class="card">
            <h2>Images</h2>
            <div class="asset-grid">
                ${extraAssets.map((asset) => {
                    const url = toPublicAssetUrl(options.token, asset.id)
                    return `<figure class="asset-card">
                        <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
                            <img src="${escapeHtml(url)}" alt="${escapeHtml(asset.caption ?? asset.fileName)}" loading="lazy" />
                        </a>
                        <figcaption>
                            <div>${escapeHtml(asset.caption ?? asset.fileName)}</div>
                            <div class="muted">asset://${escapeHtml(asset.id)}</div>
                        </figcaption>
                    </figure>`
                }).join('\n')}
            </div>
        </section>`
        : ''

    const statusClass = /pass|ok|success/i.test(options.status)
        ? 'status-pass'
        : /fail|error/i.test(options.status)
            ? 'status-fail'
            : 'status-unknown'

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)} · HAQI Report</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    main { max-width: 960px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; }
    .meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .tag { border: 1px solid #8884; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
    .status-pass { background: #2e7d3233; color: #2e7d32; }
    .status-fail { background: #c6282833; color: #c62828; }
    .status-unknown { background: #6663; color: #666; }
    .card { border: 1px solid #8884; border-radius: 12px; padding: 16px; margin-top: 12px; }
    article { line-height: 1.6; }
    blockquote { margin: 0; padding: 0 0 0 12px; border-left: 4px solid #8884; color: #999; }
    hr { border: 0; border-top: 1px solid #8884; margin: 16px 0; }
    pre { overflow-x: auto; border-radius: 8px; padding: 12px; background: #8882; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    :not(pre) > code { border-radius: 6px; padding: 2px 6px; background: #8882; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #8884; padding: 6px 8px; text-align: left; }
    input[type='checkbox'] { pointer-events: none; }
    img { max-width: 100%; border-radius: 8px; }
    .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .asset-card { margin: 0; border: 1px solid #8883; border-radius: 10px; overflow: hidden; }
    .asset-card figcaption { padding: 10px; font-size: 12px; }
    .muted { color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(options.title)}</h1>
    <div class="meta">
      <span class="tag ${statusClass}">${escapeHtml(options.status || 'unknown')}</span>
      <span class="tag">Updated: ${escapeHtml(new Date(options.updatedAt).toISOString())}</span>
      <span class="tag">Assets: ${options.assets.length}</span>
    </div>

    <section class="card">
      <article>
        ${markdownHtml || '<p class="muted">(empty markdown)</p>'}
      </article>
    </section>

    ${extraAssetsHtml}
  </main>
</body>
</html>`
}

export function createPublicReportsRoutes(options: {
    store: Store
    reportsStorageDir: string
}): Hono {
    const app = new Hono()

    app.get('/share/r/:token', (c) => {
        const token = c.req.param('token')
        const share = options.store.reports.getShareByToken(token)
        if (!share || !isShareActive(share)) {
            return c.text('Report share not found', 404)
        }

        const report = options.store.reports.getReport(share.reportId)
        if (!report) {
            return c.text('Report not found', 404)
        }

        const assets = options.store.reports.listAssets(report.id)
        const html = buildSharePageHtml({
            token,
            title: report.title,
            status: report.status,
            updatedAt: report.updatedAt,
            markdown: report.markdown,
            assets
        })

        return c.html(html)
    })

    app.get('/share/r/:token/assets/:assetId', (c) => {
        const token = c.req.param('token')
        const assetId = c.req.param('assetId')

        const share = options.store.reports.getShareByToken(token)
        if (!share || !isShareActive(share)) {
            return c.text('Asset not found', 404)
        }

        const report = options.store.reports.getReport(share.reportId)
        if (!report) {
            return c.text('Asset not found', 404)
        }

        const asset = options.store.reports.getAsset(report.id, assetId)
        if (!asset) {
            return c.text('Asset not found', 404)
        }

        const filePath = reportAssetPath(options.reportsStorageDir, report.id, asset.storageKey)
        return new Response(Bun.file(filePath), {
            headers: {
                'Content-Type': asset.mimeType,
                'Cache-Control': 'public, max-age=3600',
                'Content-Disposition': `inline; filename="${asset.fileName.replace(/"/g, '')}"`
            }
        })
    })

    return app
}
