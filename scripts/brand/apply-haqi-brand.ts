import { promises as fs } from 'node:fs'
import { applyHaqiBrandTransforms, collectBrandTargetFiles, toRelativePath } from './common'

async function main(): Promise<void> {
    const args = new Set(Bun.argv.slice(2))
    const dryRun = args.has('--dry-run')

    const files = await collectBrandTargetFiles()
    if (files.length === 0) {
        console.log('[brand:apply] No target files found.')
        return
    }

    let changedCount = 0

    for (const filePath of files) {
        const originalContent = await fs.readFile(filePath, 'utf8')
        const transformedContent = applyHaqiBrandTransforms(originalContent)

        if (transformedContent === originalContent) {
            continue
        }

        changedCount += 1

        if (!dryRun) {
            await fs.writeFile(filePath, transformedContent, 'utf8')
        }

        console.log(`${dryRun ? '[dry-run]' : '[updated]'} ${toRelativePath(filePath)}`)
    }

    if (changedCount === 0) {
        console.log('[brand:apply] No branding updates needed.')
        return
    }

    if (dryRun) {
        console.log(`[brand:apply] ${changedCount} file(s) would be updated.`)
    } else {
        console.log(`[brand:apply] Updated ${changedCount} file(s).`)
    }
}

void main().catch((error) => {
    console.error('[brand:apply] Failed:', error)
    process.exit(1)
})
