import type { AttachmentMetadata } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { isImageMimeType } from '@/lib/fileAttachments'

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ImageAttachment(props: { attachment: AttachmentMetadata }) {
    const { attachment } = props
    return (
        <figure className="message-attachment-image relative overflow-hidden rounded-xl">
            <img
                src={attachment.previewUrl}
                alt={attachment.filename}
                className="max-h-56 max-w-full object-contain"
                loading="lazy"
            />
            <figcaption className="message-attachment-image-caption">
                <span className="line-clamp-1">{attachment.filename}</span>
            </figcaption>
        </figure>
    )
}

function FileAttachment(props: { attachment: AttachmentMetadata }) {
    const { attachment } = props
    return (
        <div className="message-attachment-file">
            <span className="message-attachment-file-icon">
                <FileIcon fileName={attachment.filename} size={22} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="message-attachment-file-name truncate">
                    {attachment.filename}
                </div>
                <div className="message-attachment-file-meta">
                    {formatFileSize(attachment.size)}
                </div>
            </div>
        </div>
    )
}

export function MessageAttachments(props: { attachments: AttachmentMetadata[] }) {
    const { attachments } = props
    if (!attachments || attachments.length === 0) return null

    const images = attachments.filter(a => isImageMimeType(a.mimeType) && a.previewUrl)
    const files = attachments.filter(a => !isImageMimeType(a.mimeType) || !a.previewUrl)

    return (
        <div className="mt-2 flex flex-col gap-2">
            {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {images.map(attachment => (
                        <ImageAttachment key={attachment.id} attachment={attachment} />
                    ))}
                </div>
            )}
            {files.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {files.map(attachment => (
                        <FileAttachment key={attachment.id} attachment={attachment} />
                    ))}
                </div>
            )}
        </div>
    )
}
