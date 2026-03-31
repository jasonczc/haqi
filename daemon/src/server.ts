export async function startServer(options: { port: number; authToken: string }) {
    console.log(`haqi-daemon placeholder on port ${options.port}`)
    return { port: options.port, stop: () => {} }
}
