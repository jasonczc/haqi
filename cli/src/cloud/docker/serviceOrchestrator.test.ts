import { describe, expect, it } from 'vitest'
import { DockerServiceOrchestrator } from './serviceOrchestrator'

describe('DockerServiceOrchestrator', () => {
    it('publishes service ports on the host docker runtime', async () => {
        let capturedSpec: any = null
        const runtime = {
            run: async (spec: any) => {
                capturedSpec = spec
                return 'svc-container'
            },
            inspect: async () => ({
                id: 'svc-container',
                portBindings: {
                    6379: 46379
                }
            })
        }

        const orchestrator = new DockerServiceOrchestrator(runtime as any)
        const started = await orchestrator.startServices({
            services: [
                {
                    name: 'redis',
                    image: 'redis:7',
                    ports: [
                        {
                            containerPort: 6379,
                            expose: true
                        }
                    ]
                }
            ],
            sessionId: 'sess-1',
            workspaceDir: '/workspace'
        })

        expect(capturedSpec.ports).toEqual([
            {
                containerPort: 6379,
                hostPort: undefined,
                protocol: 'tcp'
            }
        ])
        expect(started[0]?.env).toEqual({
            REDIS_6379: '46379',
            REDIS_6379_URL: 'http://127.0.0.1:46379'
        })
        expect(orchestrator.collectServiceEndpoints(started)).toEqual([
            {
                service: 'redis',
                host: '127.0.0.1',
                port: 46379,
                containerPort: 6379,
                url: 'http://127.0.0.1:46379'
            }
        ])
        expect(started[0]?.previews).toEqual([
            {
                id: 'redis-6379',
                name: 'redis:6379',
                port: 46379,
                url: 'http://127.0.0.1:46379',
                visibility: 'private'
            }
        ])
    })
})
