import { describe, expect, it } from 'bun:test'
import { InnerDockerServiceOrchestrator } from './innerServiceOrchestrator'

describe('InnerDockerServiceOrchestrator', () => {
    it('starts managed services inside the workspace-local docker daemon', async () => {
        const execCalls: Array<{ command: string[]; env?: string[] }> = []
        const runtime = {
            exec: async (spec: any) => {
                execCalls.push({ command: spec.command, env: spec.env })
                return { stdout: 'inner-redis-container\n', stderr: '' }
            }
        }

        const orchestrator = new InnerDockerServiceOrchestrator(runtime as any, 'workspace-123', 'haqi', '/home/haqi')
        const started = await orchestrator.startServices({
            sessionId: 'sess-1',
            workspaceDir: '/workspace',
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
            ]
        })

        expect(execCalls[0]?.command).toEqual([
            'sh',
            '-lc',
            'ids="$(docker ps -aq --filter label=haqi.managed_service=true)"; [ -z "$ids" ] || docker rm -f $ids >/dev/null 2>&1'
        ])
        expect(execCalls[1]?.command).toEqual([
            'docker',
            'run',
            '-d',
            '--name',
            'haqi-sess-1-redis',
            '-p',
            '6379:6379/tcp',
            '--label',
            'haqi.session_id=sess-1',
            '--label',
            'haqi.service_name=redis',
            '--label',
            'haqi.managed_service=true',
            'redis:7'
        ])
        expect(execCalls[1]?.env).toEqual(expect.arrayContaining([
            'DOCKER_HOST=unix:///tmp/xdg-runtime-haqi/docker.sock',
            'XDG_RUNTIME_DIR=/tmp/xdg-runtime-haqi'
        ]))
        expect(started[0]?.env).toEqual({
            REDIS_6379: '6379',
            REDIS_6379_URL: 'http://127.0.0.1:6379'
        })
        expect(orchestrator.collectServiceEndpoints(started)).toEqual([
            {
                service: 'redis',
                host: '127.0.0.1',
                port: 6379,
                containerPort: 6379,
                url: 'http://127.0.0.1:6379'
            }
        ])
    })
})
