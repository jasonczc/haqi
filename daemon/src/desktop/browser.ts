import { resolveDesktopBrowserExecutable } from './browserExecutable'

let browserInstance: any = null
let pageInstance: any = null

async function ensureBrowser(): Promise<{ browser: any; page: any }> {
    if (browserInstance && pageInstance) {
        return { browser: browserInstance, page: pageInstance }
    }

    try {
        const executablePath = resolveDesktopBrowserExecutable()
        if (!executablePath) {
            throw new Error('No supported desktop browser executable found')
        }

        // Dynamic import with Function constructor to bypass TS module resolution
        // playwright may not be installed in all environments
        const { chromium } = await (new Function('m', 'return import(m)'))('playwright') as any
        browserInstance = await chromium.launch({
            headless: false, // Use the desktop's display
            executablePath,
            args: ['--disable-gpu']
        })
        pageInstance = await browserInstance.newPage()
        return { browser: browserInstance, page: pageInstance }
    } catch (err) {
        throw new Error(`Failed to launch browser: ${err instanceof Error ? err.message : err}`)
    }
}

export async function navigate(url: string): Promise<{ url: string; title: string }> {
    const { page } = await ensureBrowser()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    return { url: page.url(), title: await page.title() }
}

export async function browserClick(selector: string): Promise<void> {
    const { page } = await ensureBrowser()
    await page.click(selector, { timeout: 10000 })
}

export async function browserType(selector: string, text: string): Promise<void> {
    const { page } = await ensureBrowser()
    await page.fill(selector, text, { timeout: 10000 })
}

export async function browserScreenshot(): Promise<string> {
    const { page } = await ensureBrowser()
    const buffer = await page.screenshot({ type: 'png' })
    return buffer.toString('base64')
}

export async function browserContent(): Promise<string> {
    const { page } = await ensureBrowser()
    return await page.content()
}

export async function browserEvaluate(script: string): Promise<unknown> {
    const { page } = await ensureBrowser()
    return await page.evaluate(script)
}

export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close().catch(() => {})
        browserInstance = null
        pageInstance = null
    }
}
