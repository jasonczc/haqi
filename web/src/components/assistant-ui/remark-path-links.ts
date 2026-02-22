import { encodePathLink } from '@/lib/pathLinks'

const PATH_TOKEN_REGEX = /(^|[\s([{"'`])((?:\/|\.{1,2}\/)[^\s<>()\[\]{}"'`]+)/g
const TRAILING_PATH_PUNCTUATION_REGEX = /[),.;:!?]+$/
const SKIP_PARENT_TYPES = new Set([
    'link',
    'linkReference',
    'inlineCode',
    'code',
    'definition',
    'html'
])

function trimTrailingPathPunctuation(token: string): string {
    return token.replace(TRAILING_PATH_PUNCTUATION_REGEX, '')
}

function isPathCandidate(value: string): boolean {
    if (!value) return false
    if (value === '/' || value === './' || value === '../') return false
    if (value.startsWith('//')) return false
    return value.startsWith('/') || value.startsWith('./') || value.startsWith('../')
}

function buildPathNodes(value: string): Array<Record<string, unknown>> | null {
    PATH_TOKEN_REGEX.lastIndex = 0
    const nodes: Array<Record<string, unknown>> = []
    let cursor = 0
    let hasPathLink = false

    for (let match = PATH_TOKEN_REGEX.exec(value); match !== null; match = PATH_TOKEN_REGEX.exec(value)) {
        const leading = match[1] ?? ''
        const candidateRaw = match[2] ?? ''
        const matchStart = match.index
        const pathStart = matchStart + leading.length

        if (matchStart > cursor) {
            nodes.push({ type: 'text', value: value.slice(cursor, matchStart) })
        }

        if (leading) {
            nodes.push({ type: 'text', value: leading })
        }

        const candidate = trimTrailingPathPunctuation(candidateRaw)
        if (isPathCandidate(candidate)) {
            hasPathLink = true
            nodes.push({
                type: 'link',
                url: encodePathLink(candidate),
                children: [{ type: 'text', value: candidate }]
            })

            const trailing = candidateRaw.slice(candidate.length)
            if (trailing) {
                nodes.push({ type: 'text', value: trailing })
            }
        } else {
            nodes.push({ type: 'text', value: candidateRaw })
        }

        cursor = pathStart + candidateRaw.length
    }

    if (cursor < value.length) {
        nodes.push({ type: 'text', value: value.slice(cursor) })
    }

    return hasPathLink ? nodes : null
}

function transformChildren(children: Array<Record<string, unknown>>, parentType: string): void {
    if (SKIP_PARENT_TYPES.has(parentType)) {
        return
    }

    for (let index = 0; index < children.length; index += 1) {
        const child = children[index]
        if (!child || typeof child !== 'object') {
            continue
        }

        const childType = typeof child.type === 'string' ? child.type : ''
        if (childType === 'text' && typeof child.value === 'string') {
            const replacement = buildPathNodes(child.value)
            if (replacement && replacement.length > 0) {
                children.splice(index, 1, ...replacement)
                index += replacement.length - 1
                continue
            }
        }

        if (Array.isArray(child.children)) {
            transformChildren(child.children as Array<Record<string, unknown>>, childType)
        }
    }
}

export function remarkPathLinks() {
    return (tree: Record<string, unknown>) => {
        if (!tree || typeof tree !== 'object' || !Array.isArray(tree.children)) {
            return
        }

        transformChildren(tree.children as Array<Record<string, unknown>>, 'root')
    }
}
