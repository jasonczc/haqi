import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const RECORDINGS_DIR = '/tmp/haqi-recordings'
const DISPLAY = process.env.DISPLAY || ':1'

export class RecordingManager {
    private ffmpeg: ChildProcess | null = null
    private currentFile: string | null = null
    private startedAt: number | null = null

    async start(sessionId: string, resolution = '1280x720', framerate = 5): Promise<string> {
        if (this.ffmpeg) {
            throw new Error('Recording already in progress')
        }

        await mkdir(RECORDINGS_DIR, { recursive: true })
        const filename = `session-${sessionId}-${Date.now()}.mp4`
        this.currentFile = join(RECORDINGS_DIR, filename)

        this.ffmpeg = spawn('ffmpeg', [
            '-f', 'x11grab',
            '-video_size', resolution,
            '-framerate', String(framerate),
            '-i', DISPLAY,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '30',
            '-y',
            this.currentFile
        ], {
            stdio: 'ignore',
            env: { ...process.env, DISPLAY }
        })

        this.startedAt = Date.now()
        return filename
    }

    stop(): string | null {
        if (!this.ffmpeg) return null
        this.ffmpeg.kill('SIGINT') // Graceful stop for ffmpeg
        this.ffmpeg = null
        const file = this.currentFile
        this.currentFile = null
        this.startedAt = null
        return file
    }

    isRecording(): boolean {
        return this.ffmpeg !== null
    }

    status(): { recording: boolean; file: string | null; durationMs: number | null } {
        return {
            recording: this.ffmpeg !== null,
            file: this.currentFile,
            durationMs: this.startedAt ? Date.now() - this.startedAt : null
        }
    }

    async listRecordings(): Promise<Array<{ name: string; size: number; createdAt: number }>> {
        try {
            const files = await readdir(RECORDINGS_DIR)
            const results = []
            for (const name of files) {
                if (!name.endsWith('.mp4') && !name.endsWith('.png')) continue
                const s = await stat(join(RECORDINGS_DIR, name))
                results.push({ name, size: s.size, createdAt: s.mtimeMs })
            }
            return results.sort((a, b) => b.createdAt - a.createdAt)
        } catch {
            return []
        }
    }

    getFilePath(name: string): string {
        return join(RECORDINGS_DIR, name)
    }
}
