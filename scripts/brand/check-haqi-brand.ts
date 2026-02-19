import { promises as fs } from 'node:fs'
import { applyHaqiBrandTransforms, collectBrandTargetFiles, toRelativePath } from './common'

async function main(): Promise<void> {
    const files = await collectBrandTargetFiles()
    if (files.length === 0) {
        console.log('[brand:check] No target files found.')
        return
    }

    const driftedFiles: string[] = []

    for (const filePath of files) {
        const originalContent = await fs.readFile(filePath, 'utf8')
        const transformedContent = applyHaqiBrandTransforms(originalContent)

        if (transformedContent !== originalContent) {
            driftedFiles.push(toRelativePath(filePath))
        }
    }

    if (driftedFiles.length === 0) {
        console.log('[brand:check] OK - branding is consistent.')
        return
    }

    console.error('[brand:check] Found files that still need HAQI branding normalization:')
    for (const relativePath of driftedFiles) {
        console.error(`  - ${relativePath}`)
    }
    console.error('\nRun: bun run brand:apply')
    process.exit(1)
}

void main().catch((error) => {
    console.error('[brand:check] Failed:', error)
    process.exit(1)
})
