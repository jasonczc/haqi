/**
 * ReviewLoopController
 *
 * Orchestrates the Worker-Reviewer review loop from the CLI side.
 * This controller manages the state machine flow:
 *
 *   1. Reviewer generates instruction → dispatch to Worker
 *   2. Worker executes → returns WorkerOutput
 *   3. Reviewer reviews → returns ReviewVerdict
 *   4. Route: continue / pass / abort / notify_user
 *
 * The controller communicates with the hub via a generic HTTP transport,
 * and dispatches messages to worker/reviewer sessions via the hub.
 */

import axios from 'axios'
import { configuration } from '@/configuration'
import { getAuthToken } from '@/api/auth'

export type ReviewLoopStatus =
    | 'executing'
    | 'reviewing'
    | 'waiting_user'
    | 'accepted'
    | 'aborted'
    | 'canceled'

export type ReviewLoopUserPreference = 'auto' | 'verbose' | 'silent'

export type ReviewVerdictAction = 'continue' | 'pass' | 'abort' | 'notify_user'

export type ReviewVerdict = {
    action: ReviewVerdictAction
    feedback: string
    userMessage?: string
    progress: number
    criteriaStatus: Array<{
        criteria: string
        status: 'met' | 'not_met' | 'unclear'
        note?: string
    }>
}

export type WorkerOutput = {
    rawResponse: string
    summary?: string
    diff: string
    filesChanged: string[]
    commands: Array<{
        command: string
        exitCode: number
        stdout: string
        stderr: string
    }>
    exitStatus: 'success' | 'error'
}

export type ReviewLoopConfig = {
    loopId: string
    namespace: string
    workerSessionId: string
    reviewerSessionId: string
    requirement: string
    acceptanceCriteria: string
    maxRounds: number
    userPreference: ReviewLoopUserPreference
}

export type ReviewLoopEvent =
    | { type: 'round_started'; round: number; instruction: string }
    | { type: 'worker_output'; round: number; output: WorkerOutput }
    | { type: 'verdict'; round: number; verdict: ReviewVerdict }
    | { type: 'status_changed'; status: ReviewLoopStatus; round: number; progress: number }
    | { type: 'notify_user'; message: string; round: number; progress: number }
    | { type: 'completed'; status: 'accepted' | 'aborted' | 'canceled'; round: number }
    | { type: 'error'; message: string }

export type ReviewLoopEventHandler = (event: ReviewLoopEvent) => void

export class ReviewLoopController {
    private readonly config: ReviewLoopConfig
    private readonly listeners: Set<ReviewLoopEventHandler> = new Set()
    private status: ReviewLoopStatus = 'executing'
    private currentRound = 0
    private stopped = false

    constructor(config: ReviewLoopConfig) {
        this.config = config
    }

    on(handler: ReviewLoopEventHandler): () => void {
        this.listeners.add(handler)
        return () => this.listeners.delete(handler)
    }

    async start(initialInstruction: string): Promise<void> {
        if (this.stopped) {
            throw new Error('ReviewLoopController has been stopped')
        }

        this.currentRound = 1
        this.status = 'executing'
        this.emit({
            type: 'status_changed',
            status: 'executing',
            round: this.currentRound,
            progress: 0
        })

        await this.executeRound(initialInstruction)
    }

    async onWorkerComplete(roundId: string, output: WorkerOutput): Promise<void> {
        if (this.stopped) return

        this.emit({
            type: 'worker_output',
            round: this.currentRound,
            output
        })

        this.status = 'reviewing'
        this.emit({
            type: 'status_changed',
            status: 'reviewing',
            round: this.currentRound,
            progress: 0
        })

        try {
            await this.apiPost(
                `/api/review-loops/${this.config.loopId}/rounds/${roundId}/worker-output`,
                { workerOutput: output }
            )
        } catch (error) {
            this.emit({ type: 'error', message: `Failed to submit worker output: ${error}` })
        }
    }

    async onReviewerVerdict(roundId: string, verdict: ReviewVerdict): Promise<void> {
        if (this.stopped) return

        this.emit({
            type: 'verdict',
            round: this.currentRound,
            verdict
        })

        try {
            const result = await this.apiPost<{
                loop: { status: ReviewLoopStatus; currentRound: number }
                round: unknown
                nextAction: string
            }>(
                `/api/review-loops/${this.config.loopId}/rounds/${roundId}/verdict`,
                { verdict }
            )

            this.status = result.loop.status

            switch (result.nextAction) {
                case 'completed':
                case 'aborted': {
                    this.emit({
                        type: 'completed',
                        status: this.status as 'accepted' | 'aborted',
                        round: this.currentRound
                    })
                    this.stop()
                    break
                }
                case 'waiting_user':
                case 'waiting_user_verbose': {
                    this.emit({
                        type: 'notify_user',
                        message: verdict.userMessage ?? verdict.feedback,
                        round: this.currentRound,
                        progress: verdict.progress
                    })
                    this.emit({
                        type: 'status_changed',
                        status: 'waiting_user',
                        round: this.currentRound,
                        progress: verdict.progress
                    })
                    break
                }
                case 'auto_continue': {
                    this.currentRound += 1
                    await this.executeRound(verdict.feedback)
                    break
                }
            }
        } catch (error) {
            this.emit({ type: 'error', message: `Failed to submit verdict: ${error}` })
        }
    }

    async userContinue(options?: {
        userPreference?: ReviewLoopUserPreference
        additionalInstruction?: string
    }): Promise<void> {
        if (this.status !== 'waiting_user') {
            throw new Error(`Cannot continue: loop is in ${this.status} state`)
        }

        try {
            await this.apiPost(
                `/api/review-loops/${this.config.loopId}/continue`,
                options ?? {}
            )

            this.status = 'executing'
            this.currentRound += 1
            this.emit({
                type: 'status_changed',
                status: 'executing',
                round: this.currentRound,
                progress: 0
            })
        } catch (error) {
            this.emit({ type: 'error', message: `Failed to continue: ${error}` })
        }
    }

    async cancel(): Promise<void> {
        try {
            await this.apiPost(`/api/review-loops/${this.config.loopId}/cancel`, {})
        } catch {
            // best effort
        }

        this.status = 'canceled'
        this.emit({
            type: 'completed',
            status: 'canceled',
            round: this.currentRound
        })
        this.stop()
    }

    async setPreference(preference: ReviewLoopUserPreference): Promise<void> {
        try {
            await this.apiPatch(`/api/review-loops/${this.config.loopId}`, {
                userPreference: preference
            })
            this.config.userPreference = preference
        } catch (error) {
            this.emit({ type: 'error', message: `Failed to update preference: ${error}` })
        }
    }

    async setMaxRounds(maxRounds: number): Promise<void> {
        try {
            await this.apiPatch(`/api/review-loops/${this.config.loopId}`, { maxRounds })
            this.config.maxRounds = maxRounds
        } catch (error) {
            this.emit({ type: 'error', message: `Failed to update max rounds: ${error}` })
        }
    }

    getStatus(): ReviewLoopStatus {
        return this.status
    }

    getCurrentRound(): number {
        return this.currentRound
    }

    stop(): void {
        this.stopped = true
    }

    // ---- Internal ----

    private async executeRound(instruction: string): Promise<void> {
        this.emit({
            type: 'round_started',
            round: this.currentRound,
            instruction
        })

        try {
            await this.apiPost(`/api/review-loops/${this.config.loopId}/rounds`, { instruction })
        } catch (error) {
            this.emit({ type: 'error', message: `Failed to start round: ${error}` })
        }
    }

    private async apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
        const response = await axios.post<T>(
            `${configuration.apiUrl}${path}`,
            body,
            {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60_000
            }
        )
        return response.data
    }

    private async apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
        const response = await axios.patch<T>(
            `${configuration.apiUrl}${path}`,
            body,
            {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60_000
            }
        )
        return response.data
    }

    private emit(event: ReviewLoopEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event)
            } catch {
                // don't let listener errors crash the loop
            }
        }
    }
}
