import { z } from 'zod'

export const SpawnRequestSchema = z.object({
    command: z.array(z.string()).min(1),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional()
})

export type SpawnRequest = z.infer<typeof SpawnRequestSchema>

export const SpawnResponseSchema = z.object({
    pid: z.number(),
    status: z.enum(['running', 'failed']),
    error: z.string().optional()
})

export type SpawnResponse = z.infer<typeof SpawnResponseSchema>

export const ProcessStatusSchema = z.object({
    pid: z.number().nullable(),
    running: z.boolean(),
    exitCode: z.number().nullable(),
    signal: z.string().nullable(),
    uptimeMs: z.number().nullable()
})

export type ProcessStatus = z.infer<typeof ProcessStatusSchema>

export const PrepareRequestSchema = z.object({
    commands: z.array(z.string()),
    cwd: z.string(),
    env: z.record(z.string()).optional()
})

export type PrepareRequest = z.infer<typeof PrepareRequestSchema>

export const PrepareResponseSchema = z.object({
    success: z.boolean(),
    error: z.string().optional()
})

export type PrepareResponse = z.infer<typeof PrepareResponseSchema>

export const PortInfoSchema = z.object({
    port: z.number(),
    pid: z.number().optional(),
    process: z.string().optional()
})

export type PortInfo = z.infer<typeof PortInfoSchema>

export const HealthResponseSchema = z.object({
    status: z.literal('ok'),
    pid: z.number(),
    uptimeMs: z.number()
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>

// WebSocket event types
export type OutputEvent = {
    type: 'stdout' | 'stderr'
    data: string
    timestamp: number
}

export type ProcessEvent = {
    type: 'exit' | 'error' | 'spawn'
    pid?: number
    exitCode?: number | null
    signal?: string | null
    error?: string
    timestamp: number
}

export const CheckpointSaveRequestSchema = z.object({})

export type CheckpointSaveRequest = z.infer<typeof CheckpointSaveRequestSchema>

export const CheckpointSaveResponseSchema = z.object({
    containerId: z.string(),
    success: z.boolean()
})

export type CheckpointSaveResponse = z.infer<typeof CheckpointSaveResponseSchema>

export type PreviewTunnelMessage =
    | {
        type: 'request'
        id: string
        method: string
        path: string
        headers: Record<string, string>
        body?: string
    }
    | {
        type: 'response'
        id: string
        status: number
        headers: Record<string, string>
        body?: string
    }
    | {
        type: 'ws-open'
        id: string
        path: string
        headers: Record<string, string>
    }
    | {
        type: 'ws-data'
        id: string
        data: string
    }
    | {
        type: 'ws-close'
        id: string
        code?: number
    }
