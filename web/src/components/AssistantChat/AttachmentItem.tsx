import { useEffect, useState } from 'react'
import { AttachmentPrimitive, useThreadComposerAttachment } from '@assistant-ui/react'
import { Spinner } from '@/components/Spinner'

function ErrorIcon() {
    return (
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
    )
}

function RemoveIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <line x1="3" y1="3" x2="9" y2="9" />
            <line x1="9" y1="3" x2="3" y2="9" />
        </svg>
    )
}

function FileIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    )
}

function extensionOf(name: string): string {
    const idx = name.lastIndexOf('.')
    if (idx < 0 || idx >= name.length - 1) return ''
    return name.slice(idx + 1).toUpperCase().slice(0, 4)
}

export function AttachmentItem() {
    const attachment = useThreadComposerAttachment() as unknown as {
        name: string
        status: { type: string }
        contentType?: string
        file?: File
    }
    const { name, status, contentType, file } = attachment
    const isUploading = status.type === 'running'
    const isError = status.type === 'incomplete'
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    useEffect(() => {
        if (!file) return
        const isImage = (contentType ?? file.type ?? '').startsWith('image/')
        if (!isImage) return
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [file, contentType])

    const isImage = Boolean(previewUrl)
    const ext = extensionOf(name)

    return (
        <AttachmentPrimitive.Root
            className="composer-attachment-thumb"
            title={name}
            aria-label={name}
        >
            {isImage ? (
                <img src={previewUrl ?? undefined} alt={name} />
            ) : (
                <div className="composer-attachment-fallback">
                    <FileIcon />
                    {ext ? <span className="composer-attachment-ext">{ext}</span> : null}
                </div>
            )}

            {isUploading ? (
                <div className="composer-attachment-overlay">
                    <Spinner size="sm" label={null} className="text-white" />
                </div>
            ) : null}
            {isError ? (
                <div className="composer-attachment-overlay error">
                    <ErrorIcon />
                </div>
            ) : null}

            <AttachmentPrimitive.Remove
                className="composer-attachment-remove"
                aria-label="Remove attachment"
                title="Remove attachment"
            >
                <RemoveIcon />
            </AttachmentPrimitive.Remove>
        </AttachmentPrimitive.Root>
    )
}
