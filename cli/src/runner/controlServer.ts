/**
 * HTTP control server for runner management
 * Provides endpoints for listing sessions, stopping sessions, and runner shutdown
 */

import fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { logger } from '@/ui/logger';
import { Metadata } from '@/api/types';
import { TrackedSession } from './types';
import { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/rpcTypes';

function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function startRunnerControlServer({
  getChildren,
  stopSession,
  spawnSession,
  requestShutdown,
  onHappySessionWebhook,
  onDaemonProcessExited,
  callbackToken
}: {
  getChildren: () => TrackedSession[];
  stopSession: (sessionId: string) => boolean;
  spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
  requestShutdown: () => void;
  onHappySessionWebhook: (sessionId: string, metadata: Metadata) => void;
  onDaemonProcessExited: (pid: number, exitCode?: number | null, signal?: string | null) => void;
  callbackToken?: string;
}): Promise<{ port: number; stop: () => Promise<void> }> {
  return new Promise((resolve) => {
    const app = fastify({
      logger: false // We use our own logger
    });

    // Set up Zod type provider
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>();

    // Session reports itself after creation
    typed.post('/session-started', {
      schema: {
        body: z.object({
          sessionId: z.string(),
          metadata: z.any(), // Metadata type from API
          callbackToken: z.string().optional()
        }),
        response: {
          200: z.object({
            status: z.literal('ok')
          }),
          401: z.object({
            status: z.literal('unauthorized')
          })
        }
      }
    }, async (request, reply) => {
      const { sessionId, metadata, callbackToken: requestCallbackToken } = request.body;

      if (!isLoopbackAddress(request.ip) && callbackToken && requestCallbackToken !== callbackToken) {
        reply.code(401);
        return {
          status: 'unauthorized'
        } as any;
      }

      logger.debug(`[CONTROL SERVER] Session started: ${sessionId}`);
      onHappySessionWebhook(sessionId, metadata);

      return { status: 'ok' as const };
    });

    typed.post('/process-exited', {
      schema: {
        body: z.object({
          pid: z.number(),
          exitCode: z.number().nullable().optional(),
          signal: z.string().nullable().optional(),
          callbackToken: z.string().optional()
        }),
        response: {
          200: z.object({
            status: z.literal('ok')
          }),
          401: z.object({
            status: z.literal('unauthorized')
          })
        }
      }
    }, async (request, reply) => {
      const {
        pid,
        exitCode,
        signal,
        callbackToken: requestCallbackToken
      } = request.body;

      if (!isLoopbackAddress(request.ip) && callbackToken && requestCallbackToken !== callbackToken) {
        reply.code(401);
        return {
          status: 'unauthorized'
        } as const;
      }

      logger.debug(`[CONTROL SERVER] Daemon process exited: pid=${pid}, exitCode=${exitCode ?? 'null'}, signal=${signal ?? 'null'}`);
      onDaemonProcessExited(pid, exitCode ?? null, signal ?? null);
      return { status: 'ok' as const };
    });

    // List all tracked sessions
    typed.post('/list', {
      schema: {
        response: {
          200: z.object({
            children: z.array(z.object({
              startedBy: z.string(),
              happySessionId: z.string(),
              pid: z.number(),
              runtimeKind: z.string().optional(),
              containerId: z.string().optional(),
              workspaceId: z.string().optional(),
              previewUrls: z.array(z.object({
                id: z.string(),
                port: z.number(),
                name: z.string().optional(),
                url: z.string().optional(),
                visibility: z.enum(['private', 'public']).optional()
              })).optional()
            }))
          })
        }
      }
    }, async () => {
      const children = getChildren();
      logger.debug(`[CONTROL SERVER] Listing ${children.length} sessions`);
      return { 
        children: children
          .filter(child => child.happySessionId !== undefined)
          .map(child => ({
            startedBy: child.startedBy,
            happySessionId: child.happySessionId!,
            pid: child.pid,
            runtimeKind: child.runtimeKind,
            containerId: child.containerId,
            workspaceId: child.workspaceId,
            previewUrls: child.happySessionMetadataFromLocalWebhook?.previewUrls
          }))
      }
    });

    // Stop specific session
    typed.post('/stop-session', {
      schema: {
        body: z.object({
          sessionId: z.string()
        }),
        response: {
          200: z.object({
            success: z.boolean()
          })
        }
      }
    }, async (request) => {
      const { sessionId } = request.body;

      logger.debug(`[CONTROL SERVER] Stop session request: ${sessionId}`);
      const success = stopSession(sessionId);
      return { success };
    });

    // Spawn new session
    typed.post('/spawn-session', {
      schema: {
        body: z.object({
          directory: z.string(),
          sessionId: z.string().optional(),
          sessionType: z.enum(['simple', 'worktree']).optional(),
          worktreeName: z.string().optional()
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            sessionId: z.string().optional(),
            approvedNewDirectoryCreation: z.boolean().optional()
          }),
          409: z.object({
            success: z.boolean(),
            requiresUserApproval: z.boolean().optional(),
            actionRequired: z.string().optional(),
            directory: z.string().optional()
          }),
          500: z.object({
            success: z.boolean(),
            error: z.string().optional()
          })
        }
      }
    }, async (request, reply) => {
      const { directory, sessionId, sessionType, worktreeName } = request.body;

      logger.debug(`[CONTROL SERVER] Spawn session request: dir=${directory}, sessionId=${sessionId || 'new'}`);
      const result = await spawnSession({ directory, sessionId, sessionType, worktreeName });

      switch (result.type) {
        case 'success':
          // Check if sessionId exists, if not return error
          if (!result.sessionId) {
            reply.code(500);
            return {
              success: false,
              error: 'Failed to spawn session: no session ID returned'
            };
          }
          return {
            success: true,
            sessionId: result.sessionId,
            approvedNewDirectoryCreation: true
          };
        
        case 'requestToApproveDirectoryCreation':
          reply.code(409); // Conflict - user input needed
          return { 
            success: false,
            requiresUserApproval: true,
            actionRequired: 'CREATE_DIRECTORY',
            directory: result.directory
          };
        
        case 'error':
          reply.code(500);
          return { 
            success: false,
            error: result.errorMessage
          };
      }
    });

    // Stop runner
    typed.post('/stop', {
      schema: {
        response: {
          200: z.object({
            status: z.string()
          })
        }
      }
    }, async () => {
      logger.debug('[CONTROL SERVER] Stop runner request received');

      // Give time for response to arrive
      setTimeout(() => {
        logger.debug('[CONTROL SERVER] Triggering runner shutdown');
        requestShutdown();
      }, 50);

      return { status: 'stopping' };
    });

    app.listen({ port: 0, host: '0.0.0.0' }, (err, address) => {
      if (err) {
        logger.debug('[CONTROL SERVER] Failed to start:', err);
        throw err;
      }

      const port = parseInt(address.split(':').pop()!);
      logger.debug(`[CONTROL SERVER] Started on port ${port}`);

      resolve({
        port,
        stop: async () => {
          logger.debug('[CONTROL SERVER] Stopping server');
          await app.close();
          logger.debug('[CONTROL SERVER] Server stopped');
        }
      });
    });
  });
}
