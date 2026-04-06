import { useMemo } from 'react'

const EXTENSION_COLORS: Record<string, string> = {
    ts: 'rgb(49 120 198)',
    tsx: 'rgb(49 120 198)',
    js: 'rgb(247 223 30)',
    jsx: 'rgb(247 223 30)',
    json: 'rgb(245 158 11)',
    md: 'rgb(100 116 139)',
    mdx: 'rgb(100 116 139)',
    css: 'rgb(37 99 235)',
    scss: 'rgb(219 39 119)',
    html: 'rgb(249 115 22)',
    yml: 'rgb(239 68 68)',
    yaml: 'rgb(239 68 68)',
    sh: 'rgb(16 185 129)',
    bash: 'rgb(16 185 129)',
    py: 'rgb(55 118 171)',
    go: 'rgb(14 165 233)',
    rs: 'rgb(249 115 22)',
}

function getFileExtension(fileName: string): string {
    const trimmed = fileName.trim()
    if (trimmed.startsWith('.') && trimmed.indexOf('.', 1) === -1) {
        return trimmed.slice(1).toLowerCase()
    }
    const parts = trimmed.split('.')
    if (parts.length <= 1) return ''
    return parts[parts.length - 1]?.toLowerCase() ?? ''
}

export function FileIcon(props: { fileName: string; size?: number }) {
    const size = props.size ?? 20
    const color = useMemo(() => {
        const ext = getFileExtension(props.fileName)
        return EXTENSION_COLORS[ext] ?? 'var(--cursor-text-secondary)'
    }, [props.fileName])

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color }}
        >
            <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
        </svg>
    )
}
