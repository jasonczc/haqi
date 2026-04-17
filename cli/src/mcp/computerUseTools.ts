import { z } from 'zod'

export type ComputerUseToolDefinition = {
    name: string
    title: string
    description: string
    inputSchema: z.ZodTypeAny
    daemonPath: string
    daemonMethod: 'GET' | 'POST'
}

export const screenshotInputSchema: z.ZodTypeAny = z.object({}).strict()

export const clickInputSchema: z.ZodTypeAny = z.object({
    x: z.number().int().min(0).describe('X coordinate in pixels, from the left edge of the display'),
    y: z.number().int().min(0).describe('Y coordinate in pixels, from the top edge of the display'),
    button: z.enum(['left', 'middle', 'right']).optional().describe('Mouse button to click. Defaults to "left".')
})

export const typeInputSchema: z.ZodTypeAny = z.object({
    text: z.string().describe('Text to type at the current keyboard focus. Ensure a text field is focused first.')
})

export const keyInputSchema: z.ZodTypeAny = z.object({
    key: z.string().describe('xdotool key name or chord, e.g. "Return", "Escape", "Tab", "ctrl+c", "ctrl+shift+t".')
})

export const scrollInputSchema: z.ZodTypeAny = z.object({
    direction: z.enum(['up', 'down']).describe('Direction to scroll the mouse wheel.'),
    clicks: z.number().int().min(1).max(30).optional().describe('Number of wheel ticks. Defaults to 3.'),
    x: z.number().int().min(0).optional().describe('If provided, move cursor to (x,y) before scrolling.'),
    y: z.number().int().min(0).optional()
})

export const openBrowserInputSchema: z.ZodTypeAny = z.object({
    url: z.string().url().describe('URL to open in the session desktop browser.')
})

export const cursorPositionInputSchema: z.ZodTypeAny = z.object({}).strict()

export const COMPUTER_USE_TOOL_DEFINITIONS: ComputerUseToolDefinition[] = [
    {
        name: 'screenshot',
        title: 'Take a screenshot',
        description:
            'Capture the current state of the session desktop as a PNG. Returns the image inline plus its pixel dimensions. Always take a screenshot before planning coordinate-based actions.',
        inputSchema: screenshotInputSchema,
        daemonPath: '/desktop/screenshot',
        daemonMethod: 'POST'
    },
    {
        name: 'click',
        title: 'Click at coordinates',
        description:
            'Click the mouse at a specific pixel position on the desktop. Coordinates are absolute pixels matching the most recent screenshot. Use button "left" for normal clicks, "right" for context menus.',
        inputSchema: clickInputSchema,
        daemonPath: '/desktop/click',
        daemonMethod: 'POST'
    },
    {
        name: 'type',
        title: 'Type text',
        description:
            'Type text at the current keyboard focus. A focusable element (text field, search box) must already be focused; call click first if needed.',
        inputSchema: typeInputSchema,
        daemonPath: '/desktop/type',
        daemonMethod: 'POST'
    },
    {
        name: 'key',
        title: 'Press a key or chord',
        description:
            'Press a single key or key combination via xdotool key names. Examples: "Return", "Escape", "BackSpace", "ctrl+c", "ctrl+shift+Tab".',
        inputSchema: keyInputSchema,
        daemonPath: '/desktop/key',
        daemonMethod: 'POST'
    },
    {
        name: 'scroll',
        title: 'Scroll the wheel',
        description:
            'Scroll the mouse wheel up or down. Optionally move the cursor to (x,y) first so the scroll lands in a specific region.',
        inputSchema: scrollInputSchema,
        daemonPath: '/desktop/scroll',
        daemonMethod: 'POST'
    },
    {
        name: 'open_browser',
        title: 'Open URL in desktop browser',
        description:
            'Launch or reuse the session desktop browser pointed at a URL. Use this to start navigation instead of typing URLs into an address bar.',
        inputSchema: openBrowserInputSchema,
        daemonPath: '/desktop/open-browser',
        daemonMethod: 'POST'
    },
    {
        name: 'cursor_position',
        title: 'Get cursor position',
        description: 'Return the current mouse cursor position on the desktop as {x, y} pixels.',
        inputSchema: cursorPositionInputSchema,
        daemonPath: '/desktop/cursor',
        daemonMethod: 'GET'
    }
]
