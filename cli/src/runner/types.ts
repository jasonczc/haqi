/**
 * Runner-specific types (not related to API/server communication)
 */

import { Metadata } from '@/api/types';
import { ChildProcess } from 'child_process';
import type { RuntimeKind } from '@hapi/protocol/types';

/**
 * Session tracking for runner
 */
export interface TrackedSession {
  startedBy: 'runner' | string;
  happySessionId?: string;
  happySessionMetadataFromLocalWebhook?: Metadata;
  pid: number;
  executionBackend?: Metadata['executionBackend'];
  runtimeKind?: RuntimeKind;
  spawnRequestId?: string;
  workspaceId?: string;
  serviceContainerIds?: string[];
  containerId?: string;
  cleanupPaths?: string[];
  childProcess?: ChildProcess;
  daemonAuthToken?: string;
  noVncPort?: number;
  error?: string;
  directoryCreated?: boolean;
  message?: string;
}