import { $ } from 'bun'
import { join } from 'node:path'

const outDir = join(import.meta.dir, '..', 'dist')

console.log('Building haqi-daemon single executable...')

await $`bun build ${join(import.meta.dir, '..', 'src', 'index.ts')} --compile --outfile ${join(outDir, 'haqi-daemon')}`

console.log(`Built: ${join(outDir, 'haqi-daemon')}`)
