export type ProxyRequest = {
    port: number
    method: string
    path: string
    headers: Record<string, string>
    body?: string
}

export type ProxyResponse = {
    status: number
    headers: Record<string, string>
    body?: string
}

export function createPreviewProxy() {
    return {
        async forward(req: ProxyRequest): Promise<ProxyResponse> {
            const url = `http://127.0.0.1:${req.port}${req.path}`
            const response = await fetch(url, {
                method: req.method,
                headers: req.headers,
                body: req.body
            })

            const responseHeaders: Record<string, string> = {}
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value
            })

            const body = await response.text()
            return {
                status: response.status,
                headers: responseHeaders,
                body
            }
        }
    }
}
