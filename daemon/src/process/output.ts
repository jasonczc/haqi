export class OutputBuffer {
    private chunks: Array<{ type: 'stdout' | 'stderr'; data: string; timestamp: number }> = []
    private maxChunks = 1000

    push(type: 'stdout' | 'stderr', data: string): void {
        this.chunks.push({ type, data, timestamp: Date.now() })
        if (this.chunks.length > this.maxChunks) {
            this.chunks.shift()
        }
    }

    recent(count = 100): typeof this.chunks {
        return this.chunks.slice(-count)
    }

    clear(): void {
        this.chunks = []
    }
}
