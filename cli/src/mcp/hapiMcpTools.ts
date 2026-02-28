import { z } from 'zod'

export type HapiMcpToolDefinition = {
    name: string
    title: string
    description: string
    inputSchema: z.ZodTypeAny
}

export const changeTitleInputSchema: z.ZodTypeAny = z.object({
    title: z.string().describe('The new title for the chat session')
})

export const reportCreateInputSchema: z.ZodTypeAny = z.object({
    session_id: z.string().min(1).max(255).optional(),
    task_id: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(200).optional(),
    status: z.string().min(1).max(40).optional(),
    markdown: z.string().max(400_000).optional(),
    metadata: z.unknown().optional(),
    create_share: z.boolean().optional(),
    share_expires_in_hours: z.number().positive().max(24 * 365).optional()
})

export const reportUpdateInputSchema: z.ZodTypeAny = z.object({
    report_id: z.string().min(1).max(255),
    task_id: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(200).optional(),
    status: z.string().min(1).max(40).optional(),
    markdown: z.string().max(400_000).optional(),
    metadata: z.unknown().optional()
})

export const reportGetInputSchema: z.ZodTypeAny = z.object({
    report_id: z.string().min(1).max(255)
})

export const reportListInputSchema: z.ZodTypeAny = z.object({
    limit: z.number().int().min(1).max(200).optional(),
    session_id: z.string().min(1).max(255).optional()
})

export const reportAddAssetInputSchema: z.ZodTypeAny = z.object({
    report_id: z.string().min(1).max(255),
    filename: z.string().min(1).max(255).optional(),
    mime_type: z.string().min(1).max(255).optional(),
    content_base64: z.string().min(1).optional(),
    content_data_url: z.string().min(1).optional(),
    source_path: z.string().min(1).optional(),
    caption: z.string().max(500).optional()
}).superRefine((data, ctx) => {
    const contentFields = [
        typeof data.content_base64 === 'string' && data.content_base64.trim().length > 0,
        typeof data.content_data_url === 'string' && data.content_data_url.trim().length > 0,
        typeof data.source_path === 'string' && data.source_path.trim().length > 0
    ].filter(Boolean).length

    if (contentFields === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide one of content_base64, content_data_url, or source_path'
        })
        return
    }

    if (contentFields > 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Use only one of content_base64, content_data_url, or source_path'
        })
    }
})

export const reportCreateShareInputSchema: z.ZodTypeAny = z.object({
    report_id: z.string().min(1).max(255),
    expires_in_hours: z.number().positive().max(24 * 365).optional(),
    created_by: z.string().min(1).max(255).optional()
})

export const HAPI_MCP_TOOL_DEFINITIONS: HapiMcpToolDefinition[] = [
    {
        name: 'change_title',
        title: 'Change Chat Title',
        description: 'Change the title of the current chat session',
        inputSchema: changeTitleInputSchema
    },
    {
        name: 'report_create',
        title: 'Create Report',
        description: 'Create a markdown report and optionally create a public share link',
        inputSchema: reportCreateInputSchema
    },
    {
        name: 'report_update',
        title: 'Update Report',
        description: 'Update report title/status/markdown/metadata',
        inputSchema: reportUpdateInputSchema
    },
    {
        name: 'report_get',
        title: 'Get Report',
        description: 'Get full report details by report_id',
        inputSchema: reportGetInputSchema
    },
    {
        name: 'report_list',
        title: 'List Reports',
        description: 'List reports in current namespace',
        inputSchema: reportListInputSchema
    },
    {
        name: 'report_add_asset',
        title: 'Add Report Asset',
        description: 'Attach image/file asset to a report using base64/data-url/source-path',
        inputSchema: reportAddAssetInputSchema
    },
    {
        name: 'report_create_share',
        title: 'Create Report Share',
        description: 'Create a public share link for a report',
        inputSchema: reportCreateShareInputSchema
    }
]

