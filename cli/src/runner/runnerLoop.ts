import fs from 'fs/promises';
import os from 'os';
import type { FileHandle } from 'node:fs/promises';

import { ApiClient } from '@/api/api';
import { TrackedSession } from './types';
import { RunnerState, Metadata, MachineMetadata } from '@/api/types';
import { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/rpcTypes';
import { logger } from '@/ui/logger';
import packageJson from '../../package.json';
import { spawnHappyCLI } from '@/utils/spawnHappyCLI';
import { writeRunnerState, RunnerLocallyPersistedState, readRunnerState, releaseRunnerLock } from '@/persistence';
import { isProcessAlive, killProcess, killProcessByChildProcess } from '@/utils/process';
import { withRetry } from '@/utils/time';
import { isRetryableConnectionError } from '@/utils/errorUtils';
import { maybeAutoStartServer } from '@/utils/autoStartServer';
import { isBunCompiled, projectPath } from '@/projectPath';
import { configuration } from '@/configuration';

import { cleanupRunnerState, getInstalledCliMtimeMs } from './controlClient';
import { startRunnerControlServer } from './controlServer';
import { createWorktree, removeWorktree, type WorktreeInfo } from './worktree';
import { buildMachineMetadata } from '@/agent/sessionFactory';
import { prepareWorkspace } from '@/cloud/workspace/prepareWorkspace';
import { resolveEnvironmentTemplate } from '@/cloud/environment/resolveEnvironment';
import { loadWorkspaceEnvironmentTemplate } from '@/cloud/environment/workspaceEnvironment';
import { DockerCliRuntime } from '@/cloud/docker/dockerCli';
import { listHaqiContainers, stopSessionInContainer } from '@/cloud/docker/containerManager';
import { DockerServiceOrchestrator } from '@/cloud/docker/serviceOrchestrator';
import { buildSpawnEnvironment, startHostProcessExecutor } from '@/cloud/executors/HostProcessExecutor';
import { startDockerSessionExecutor } from '@/cloud/executors/DockerSessionExecutor';
import { startDaemonSessionExecutor } from '@/cloud/executors/DaemonSessionExecutor';
import { ensureWorkspaceContainer } from '@/cloud/executors/WorkspaceContainerManager';
import { mergePreviewTargets } from '@/cloud/preview/previewReporter';
import type { PreparedWorkspace, PreparedWorkspaceCleanup, ResolvedEnvironmentTemplate } from '@/cloud/types';
import { runEnvironmentCommands } from '@/cloud/environment/runEnvironmentCommands';
import { buildCloudRunnerStateSnapshot } from './cloudRunnerState';
import type { WorkerLifecycle } from '@hapi/protocol/types';
import { materializeResolvedSecrets } from '@/cloud/secrets/materializeSecrets';
import { syncRepositoryInContainer } from '@/cloud/workspace/syncRepositoryInContainer';
import { hydrateDesktop } from '@/cloud/desktop/hydrateDesktop';

export type RunnerLoopOptions = {
    mode: 'local' | 'remote'
    machineId: string
    getAuthToken: () => string
    getApiUrl: () => string
    metadata?: Partial<MachineMetadata>
    onShutdownRequested: Promise<{ source: 'hapi-app' | 'hapi-cli' | 'os-signal' | 'exception', errorMessage?: string }>
    requestShutdown: (source: 'hapi-app' | 'hapi-cli' | 'os-signal' | 'exception', errorMessage?: string) => void
    runnerLockHandle: FileHandle
}

export async function runRunnerLoop(options: RunnerLoopOptions): Promise<void> {
    const { machineId, requestShutdown, resolvesWhenShutdownRequested, runnerLockHandle } = {
        ...options,
        resolvesWhenShutdownRequested: options.onShutdownRequested
    };

    // Ensure configuration reflects the provided auth/url for API clients
    configuration._setCliApiToken(options.getAuthToken());
    configuration._setApiUrl(options.getApiUrl());

    // Propagate auth token and API URL to process.env so spawned child processes
    // (agent sessions) inherit them and can connect back to the Hub.
    process.env.CLI_API_TOKEN = options.getAuthToken();
    process.env.HAPI_API_URL = options.getApiUrl();

    // Setup state - key by PID
    const pidToTrackedSession = new Map<number, TrackedSession>();

    // Session spawning awaiter system
    const pidToAwaiter = new Map<number, (session: TrackedSession) => void>();
    const pidToErrorAwaiter = new Map<number, (errorMessage: string) => void>();
    const requestIdToAwaiter = new Map<string, (session: TrackedSession) => void>();
    const requestIdToErrorAwaiter = new Map<string, (errorMessage: string) => void>();
    type SpawnFailureDetails = {
      message: string
      pid?: number
      exitCode?: number | null
      signal?: NodeJS.Signals | null
    };
    let reportSpawnOutcomeToHub: ((outcome: { type: 'success' } | { type: 'error'; details: SpawnFailureDetails }) => void) | null = null;
    const formatSpawnError = (error: unknown): string => {
      if (error instanceof Error) {
        return error.message;
      }
      return String(error);
    };

    // Helper functions
    const getCurrentChildren = () => Array.from(pidToTrackedSession.values());

    // Handle webhook from HAPI session reporting itself
    const onHappySessionWebhook = (sessionId: string, sessionMetadata: Metadata) => {
      logger.debugLargeJson(`[RUNNER RUN] Session reported`, sessionMetadata);

      const pid = sessionMetadata.hostPid;
      const requestId = sessionMetadata.spawnRequestId;
      const existingSession = (() => {
        if (pid) {
          const byPid = pidToTrackedSession.get(pid);
          if (byPid) return byPid;
        }

        if (requestId) {
          return Array.from(pidToTrackedSession.values()).find((session) => session.spawnRequestId === requestId) ?? undefined;
        }

        return undefined;
      })();

      logger.debug(`[RUNNER RUN] Session webhook: ${sessionId}, PID: ${pid ?? 'n/a'}, requestId: ${requestId ?? 'n/a'}, started by: ${sessionMetadata.startedBy || 'unknown'}`);

      if (existingSession && existingSession.startedBy === 'runner') {
        // Update runner-spawned session with reported data
        existingSession.happySessionId = sessionId;
        existingSession.happySessionMetadataFromLocalWebhook = sessionMetadata;
        if (sessionMetadata.spawnRequestId) {
          existingSession.spawnRequestId = sessionMetadata.spawnRequestId;
        }
        if (sessionMetadata.workspaceId) {
          existingSession.workspaceId = sessionMetadata.workspaceId;
        }
        if (sessionMetadata.runtimeKind) {
          existingSession.runtimeKind = sessionMetadata.runtimeKind;
        }
        logger.debug(`[RUNNER RUN] Updated runner-spawned session ${sessionId} with metadata`);

        // Resolve any awaiter for this PID
        const awaiter = pid !== undefined ? pidToAwaiter.get(pid) : undefined;
        if (awaiter) {
          if (pid !== undefined) {
            pidToAwaiter.delete(pid);
            pidToErrorAwaiter.delete(pid);
          }
          awaiter(existingSession);
          logger.debug(`[RUNNER RUN] Resolved session awaiter for PID ${pid}`);
        }
        if (requestId) {
          const requestAwaiter = requestIdToAwaiter.get(requestId);
          if (requestAwaiter) {
            requestIdToAwaiter.delete(requestId);
            requestIdToErrorAwaiter.delete(requestId);
            requestAwaiter(existingSession);
            logger.debug(`[RUNNER RUN] Resolved session awaiter for requestId ${requestId}`);
          }
        }

        syncCloudRunnerState({
          currentSessionId: sessionId,
          workspacePreparation: null,
          lastWorkspaceError: null,
          status: 'running',
          lifecycle: 'busy'
        });
      } else if (!existingSession) {
        if (!pid) {
          logger.debug(`[RUNNER RUN] Session webhook missing hostPid and no matching requestId for sessionId: ${sessionId}`);
          return;
        }
        // New session started externally
        const trackedSession: TrackedSession = {
          startedBy: 'hapi directly - likely by user from terminal',
          happySessionId: sessionId,
          happySessionMetadataFromLocalWebhook: sessionMetadata,
          pid,
          spawnRequestId: sessionMetadata.spawnRequestId,
          workspaceId: sessionMetadata.workspaceId,
          runtimeKind: sessionMetadata.runtimeKind
        };
        pidToTrackedSession.set(pid, trackedSession);
        syncCloudRunnerState({
          currentSessionId: sessionId,
          workspacePreparation: null,
          lastWorkspaceError: null,
          status: 'running',
          lifecycle: 'busy'
        });
        logger.debug(`[RUNNER RUN] Registered externally-started session ${sessionId}`);
      }
    };

    // Spawn a new session (sessionId reserved for future --resume functionality)
    const spawnSession = async (options: SpawnSessionOptions): Promise<SpawnSessionResult> => {
      logger.debugLargeJson('[RUNNER RUN] Spawning session', options);

      const { directory, approvedNewDirectoryCreation = true } = options;
      const spawnRequestId = options.spawnRequestId ?? options.resumeSessionId ?? options.sessionId ?? `spawn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const sessionType = options.sessionType ?? 'simple';
      const worktreeName = options.worktreeName;
      const repository = options.workspaceSource?.repository;
      const workspacePreparationStartedAt = Date.now();
      let directoryCreated = false;
      let spawnDirectory = directory ?? options.workspaceSource?.directory;
      let worktreeInfo: WorktreeInfo | null = null;
      let happyProcess: ReturnType<typeof spawnHappyCLI> | null = null;
      let preparedWorkspace: PreparedWorkspace | null = null;
      let preparedWorkspaceCleanup: PreparedWorkspaceCleanup | null = null;
      let resolvedEnvironment: ResolvedEnvironmentTemplate | null = null;
      let startedServices: Awaited<ReturnType<DockerServiceOrchestrator['startServices']>> = [];
      let dockerServiceOrchestrator: DockerServiceOrchestrator | null = null;
      let dockerRuntime: DockerCliRuntime | null = null;
      let workspaceContainerId: string | undefined;
      let workspaceContainerPreviewTargets: Metadata['previewUrls'] | undefined;
      let extraEnv: Record<string, string> = {};
      let secretCleanupPaths: string[] = [];
      let serviceEndpoints: ReturnType<DockerServiceOrchestrator['collectServiceEndpoints']> = [];
      let repoSyncStatus: Metadata['repoSyncStatus'] | undefined;
      let repositoryCommit: string | undefined;
      let desktopState: Metadata['desktopState'] | undefined;
      let languageServers: Metadata['languageServers'] | undefined;
      let terminalDescriptors: Metadata['terminalDescriptors'] | undefined;
      let setupStatusMessage = 'preparing-workspace';
      let spawnResult: SpawnSessionResult | null = null;
      let spawnFailed = false;

      const describeRepositoryRef = (): string | undefined => {
        const branch = repository?.ref?.branch?.trim();
        if (branch) {
          return branch;
        }
        const tag = repository?.ref?.tag?.trim();
        if (tag) {
          return `tag:${tag}`;
        }
        const commit = repository?.ref?.commit?.trim();
        if (commit) {
          return `commit:${commit.slice(0, 12)}`;
        }
        const pr = repository?.ref?.pr?.trim();
        if (pr) {
          return `pr:${pr}`;
        }
        return undefined;
      };

      const buildWorkspacePreparationState = (phase: string, progress?: number): NonNullable<RunnerState['workspacePreparation']> => ({
        phase,
        repo: repository?.url,
        ref: describeRepositoryRef(),
        progress,
        startedAt: workspacePreparationStartedAt,
        updatedAt: Date.now()
      });

      const updateWorkspacePreparation = (phase: string, progress?: number, status?: string) => {
        setupStatusMessage = phase;
        setSetupStatus(phase, status ?? phase);
        syncCloudRunnerState({
          currentSessionId: spawnRequestId,
          lifecycle: 'preparing-workspace',
          status: status ?? phase,
          workspacePreparation: buildWorkspacePreparationState(phase, progress)
        });
      };

      const clearPendingSpawnState = () => {
        syncCloudRunnerState({
          currentSessionId: null,
          workspacePreparation: null,
          status: pidToTrackedSession.size > 0 ? 'running' : 'idle',
          lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
        });
      };

      const cleanupWorktree = async () => {
        if (!worktreeInfo) {
          return;
        }
        const result = await removeWorktree({
          repoRoot: worktreeInfo.basePath,
          worktreePath: worktreeInfo.worktreePath
        });
        if (!result.ok) {
          logger.debug(`[RUNNER RUN] Failed to remove worktree ${worktreeInfo.worktreePath}: ${result.error}`);
        }
      };

      const maybeCleanupWorktree = async (reason: string) => {
        if (!worktreeInfo) {
          return;
        }
        const pid = happyProcess?.pid;
        if (pid && isProcessAlive(pid)) {
          logger.debug(`[RUNNER RUN] Skipping worktree cleanup after ${reason}; child still running`, {
            pid,
            worktreePath: worktreeInfo.worktreePath
          });
          return;
        }
        await cleanupWorktree();
      };

      const cleanupPreparedWorkspace = async () => {
        const cleanupPaths = [
          ...(preparedWorkspaceCleanup?.cleanupPaths ?? preparedWorkspace?.cleanupPaths ?? []),
          ...secretCleanupPaths
        ];
        for (const cleanupPath of cleanupPaths) {
          await fs.rm(cleanupPath, { recursive: true, force: true }).catch(() => undefined);
        }
      };

      const stopStartedServices = async () => {
        if (!dockerServiceOrchestrator || startedServices.length === 0) {
          return;
        }
        await dockerServiceOrchestrator.stopServices(startedServices);
      };

      const applyPreparedMetadata = (trackedSession: TrackedSession) => {
        trackedSession.spawnRequestId = spawnRequestId;
        trackedSession.workspaceId = preparedWorkspace?.workspaceId;
        trackedSession.runtimeKind = resolvedEnvironment?.runtimeKind ?? trackedSession.runtimeKind;
        trackedSession.executionBackend = options.executionBackend ?? trackedSession.executionBackend;
      };

      const setSetupStatus = (phase: string, message?: string) => {
        extraEnv.HAPI_SETUP_STATUS_JSON = JSON.stringify({
          phase,
          message,
          updatedAt: Date.now()
        });
      };

      activeSpawnCount += 1;
      updateWorkspacePreparation('requested', 0);

      try {
        if (sessionType === 'simple' && spawnDirectory) {
          try {
            await fs.access(spawnDirectory);
            logger.debug(`[RUNNER RUN] Directory exists: ${spawnDirectory}`);
          } catch {
            logger.debug(`[RUNNER RUN] Directory doesn't exist, creating: ${spawnDirectory}`);

            if (!approvedNewDirectoryCreation) {
              clearPendingSpawnState();
              return {
                type: 'requestToApproveDirectoryCreation',
                directory: spawnDirectory
              };
            }

            try {
              await fs.mkdir(spawnDirectory, { recursive: true });
              logger.debug(`[RUNNER RUN] Successfully created directory: ${spawnDirectory}`);
              directoryCreated = true;
            } catch (mkdirError: any) {
              let errorMessage = `Unable to create directory at '${spawnDirectory}'. `;

              if (mkdirError.code === 'EACCES') {
                errorMessage += `Permission denied. You don't have write access to create a folder at this location. Try using a different path or check your permissions.`;
              } else if (mkdirError.code === 'ENOTDIR') {
                errorMessage += `A file already exists at this path or in the parent path. Cannot create a directory here. Please choose a different location.`;
              } else if (mkdirError.code === 'ENOSPC') {
                errorMessage += `No space left on device. Your disk is full. Please free up some space and try again.`;
              } else if (mkdirError.code === 'EROFS') {
                errorMessage += `The file system is read-only. Cannot create directories here. Please choose a writable location.`;
              } else {
                errorMessage += `System error: ${mkdirError.message || mkdirError}. Please verify the path is valid and you have the necessary permissions.`;
              }

              syncCloudRunnerState({
                currentSessionId: null,
                workspacePreparation: buildWorkspacePreparationState('failed'),
                lastWorkspaceError: {
                  message: errorMessage,
                  code: mkdirError.code,
                  at: Date.now()
                },
                status: 'failed',
                lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
              });
              spawnFailed = true;
              logger.debug(`[RUNNER RUN] Directory creation failed: ${errorMessage}`);
              return {
                type: 'error',
                errorMessage
              };
            }
          }
        } else if (sessionType === 'simple' && !spawnDirectory) {
          spawnFailed = true;
          syncCloudRunnerState({
            currentSessionId: null,
            workspacePreparation: buildWorkspacePreparationState('failed'),
            lastWorkspaceError: {
              message: 'Directory is required for simple sessions',
              at: Date.now()
            },
            status: 'failed',
            lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
          });
          return {
            type: 'error',
            errorMessage: 'Directory is required for simple sessions'
          };
        } else if (sessionType !== 'simple' && spawnDirectory) {
          await fs.access(spawnDirectory);
          logger.debug(`[RUNNER RUN] Worktree base directory exists: ${spawnDirectory}`);
        } else if (sessionType !== 'simple' && !spawnDirectory) {
          spawnFailed = true;
          syncCloudRunnerState({
            currentSessionId: null,
            workspacePreparation: buildWorkspacePreparationState('failed'),
            lastWorkspaceError: {
              message: 'Worktree sessions require an existing Git repository directory',
              at: Date.now()
            },
            status: 'failed',
            lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
          });
          return {
            type: 'error',
            errorMessage: 'Worktree sessions require an existing Git repository directory'
          };
        }

        if (sessionType === 'worktree' && spawnDirectory) {
          const worktreeResult = await createWorktree({
            basePath: spawnDirectory,
            nameHint: worktreeName
          });
          if (!worktreeResult.ok) {
            spawnFailed = true;
            syncCloudRunnerState({
              currentSessionId: null,
              workspacePreparation: buildWorkspacePreparationState('failed'),
              lastWorkspaceError: {
                message: worktreeResult.error,
                at: Date.now()
              },
              status: 'failed',
              lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
            });
            logger.debug(`[RUNNER RUN] Worktree creation failed: ${worktreeResult.error}`);
            return {
              type: 'error',
              errorMessage: worktreeResult.error
            };
          }
          worktreeInfo = worktreeResult.info;
          spawnDirectory = worktreeInfo.worktreePath;
          logger.debug(`[RUNNER RUN] Created worktree ${worktreeInfo.worktreePath} (branch ${worktreeInfo.branch})`);
        }

        updateWorkspacePreparation('preparing-workspace', 10);
        const repositoryCredentialSecretName = options.workspaceSource?.repository?.credentialsSecretRef?.trim();
        const repositoryCredential = repositoryCredentialSecretName
          ? options.resolvedSecrets?.find((secret) => secret.secretName === repositoryCredentialSecretName)
          : undefined;
        preparedWorkspace = await prepareWorkspace({
          directory: spawnDirectory,
          workspaceSource: options.workspaceSource,
          workspace: options.workspace,
          workspaceLease: options.workspaceLease,
          repositoryCredential
        });
        preparedWorkspaceCleanup = {
          cleanupPaths: preparedWorkspace.cleanupPaths
        };
        spawnDirectory = preparedWorkspace.workingDirectory;
        updateWorkspacePreparation('workspace-ready', 30);

        const repositorySource = preparedWorkspace.source?.repository ?? options.workspaceSource?.repository;
        const isCloudRepoDockerSession = options.executionBackend !== 'local'
          && (options.runtimeKind === 'docker-session' || options.runtimeKind === 'daemon-session')
          && Boolean(repositorySource);
        dockerRuntime = isCloudRepoDockerSession ? new DockerCliRuntime() : null;

        resolvedEnvironment = resolveEnvironmentTemplate({
          runtimeKind: options.runtimeKind,
          environmentId: options.environmentId,
          environment: options.environment,
          resolvedEnvironment: options.resolvedEnvironment,
          workspaceEnvironment: isCloudRepoDockerSession ? null : (preparedWorkspace.environment ?? null),
          workspaceSource: options.workspaceSource,
          workspacePath: preparedWorkspace.workingDirectory
        });

        if (isCloudRepoDockerSession && dockerRuntime && repositorySource) {
          updateWorkspacePreparation('pulling-checkpoint', 20);
          await dockerRuntime.ensureAvailable();
          const workspaceContainer = await ensureWorkspaceContainer({
            runtime: dockerRuntime,
            workspace: preparedWorkspace,
            environment: resolvedEnvironment,
            checkpointId: options.checkpointId ?? preparedWorkspace.checkpointId,
            sessionLabel: spawnRequestId
          });
          workspaceContainerId = workspaceContainer.containerId;
          workspaceContainerPreviewTargets = workspaceContainer.previewTargets;

          updateWorkspacePreparation('syncing-repo', 30);
          const syncResult = await syncRepositoryInContainer({
            runtime: dockerRuntime,
            containerId: workspaceContainer.containerId,
            workspace: preparedWorkspace,
            repository: repositorySource,
            repoSyncPolicy: options.repoSyncPolicy ?? 'fetch-reset',
            repositoryCredential
          });
          repoSyncStatus = syncResult.repoStatus;
          repositoryCommit = syncResult.repositoryCommit;

          const workspaceEnvironment = await loadWorkspaceEnvironmentTemplate([
            preparedWorkspace.workingDirectory,
            preparedWorkspace.repoVolumePath
          ]);
          preparedWorkspace.environment = workspaceEnvironment ?? undefined;
          resolvedEnvironment = resolveEnvironmentTemplate({
            runtimeKind: options.runtimeKind,
            environmentId: options.environmentId,
            environment: options.environment,
            resolvedEnvironment: options.resolvedEnvironment,
            workspaceEnvironment,
            workspaceSource: options.workspaceSource,
            workspacePath: preparedWorkspace.workingDirectory
          });
        }

        updateWorkspacePreparation('environment-ready', 45);

        if (resolvedEnvironment.services.length > 0) {
          updateWorkspacePreparation('starting-services', 55);
          dockerServiceOrchestrator = new DockerServiceOrchestrator(new (await import('@/cloud/docker/dockerCli')).DockerCliRuntime());
          startedServices = await dockerServiceOrchestrator.startServices({
            services: resolvedEnvironment.services,
            sessionId: spawnRequestId,
            workspaceDir: preparedWorkspace.repoVolumePath
          });
          serviceEndpoints = dockerServiceOrchestrator.collectServiceEndpoints(startedServices);
        }

        const serviceEnv = Object.assign({}, ...startedServices.map((service) => service.env));
        extraEnv = await buildSpawnEnvironment(options, {
          worktreeInfo,
          serviceEnv
        });

        const runtimeSecrets = (options.resolvedSecrets ?? []).filter((secret) => {
          if (!repositoryCredentialSecretName) {
            return true;
          }
          return secret.secretName !== repositoryCredentialSecretName;
        });
        if (runtimeSecrets.length > 0) {
          const materializedSecrets = await materializeResolvedSecrets({
            secrets: runtimeSecrets,
            workspacePath: preparedWorkspace.repoVolumePath,
            requestId: spawnRequestId
          });
          extraEnv = {
            ...extraEnv,
            ...materializedSecrets.env
          };
          secretCleanupPaths = materializedSecrets.cleanupPaths;
        }

        extraEnv.HAPI_SPAWN_REQUEST_ID = spawnRequestId;
        extraEnv.HAPI_RUNTIME_KIND = resolvedEnvironment.runtimeKind;
        setSetupStatus('preparing-session', 'workspace and environment prepared');

        const workspaceMode = preparedWorkspace.mode ?? options.workspace?.mode;
        if (workspaceMode) {
          extraEnv.HAPI_WORKSPACE_MODE = workspaceMode;
        }
        if (preparedWorkspace.workspaceId) {
          extraEnv.HAPI_WORKSPACE_ID = preparedWorkspace.workspaceId;
        }
        if (preparedWorkspace.source) {
          extraEnv.HAPI_WORKSPACE_SOURCE_JSON = JSON.stringify(preparedWorkspace.source);
        }
        if (resolvedEnvironment.environmentId) {
          extraEnv.HAPI_ENVIRONMENT_ID = resolvedEnvironment.environmentId;
        }
        if (resolvedEnvironment.environment?.version) {
          extraEnv.HAPI_ENVIRONMENT_VERSION = resolvedEnvironment.environment.version;
        }
        if (options.checkpointId ?? preparedWorkspace.checkpointId) {
          extraEnv.HAPI_CHECKPOINT_ID = options.checkpointId ?? preparedWorkspace.checkpointId!;
        }
        if (options.launchMode) {
          extraEnv.HAPI_LAUNCH_MODE = options.launchMode;
        }
        if (options.repoSyncPolicy) {
          extraEnv.HAPI_REPO_SYNC_POLICY = options.repoSyncPolicy;
        }
        if (repoSyncStatus) {
          extraEnv.HAPI_REPO_SYNC_STATUS = repoSyncStatus;
        }
        if (preparedWorkspace.workspaceBranch) {
          extraEnv.HAPI_WORKSPACE_BRANCH = preparedWorkspace.workspaceBranch;
        }
        if (workspaceContainerId) {
          extraEnv.HAPI_CONTAINER_ID = workspaceContainerId;
        }

        if (repositorySource?.url) {
          extraEnv.HAPI_REPOSITORY_URL = repositorySource.url;
        }
        if (repositorySource?.provider) {
          extraEnv.HAPI_REPOSITORY_PROVIDER = repositorySource.provider;
        }
        if (repositorySource?.ref?.branch) {
          extraEnv.HAPI_REPOSITORY_BRANCH = repositorySource.ref.branch;
        }
        if (repositorySource?.ref?.tag) {
          extraEnv.HAPI_REPOSITORY_TAG = repositorySource.ref.tag;
        }
        if (repositoryCommit) {
          extraEnv.HAPI_REPOSITORY_COMMIT = repositoryCommit;
        } else if (repositorySource?.ref?.commit) {
          extraEnv.HAPI_REPOSITORY_COMMIT = repositorySource.ref.commit;
        }
        if (repositorySource?.ref?.pr) {
          extraEnv.HAPI_REPOSITORY_PR = repositorySource.ref.pr;
        }
        if (serviceEndpoints.length > 0) {
          extraEnv.HAPI_SERVICE_ENDPOINTS_JSON = JSON.stringify(serviceEndpoints);
        }

        const servicePreviewTargets = startedServices.flatMap((service) => service.previews);
        const allPreviewTargets = mergePreviewTargets(
          servicePreviewTargets.length > 0 ? servicePreviewTargets : undefined,
          workspaceContainerPreviewTargets
        );
        if (allPreviewTargets) {
          extraEnv.HAPI_PREVIEW_TARGETS_JSON = JSON.stringify(allPreviewTargets);
        }

        if (resolvedEnvironment.environment?.install) {
          updateWorkspacePreparation('running-install-hooks', 65);
          if (resolvedEnvironment.runtimeKind === 'docker-session' && dockerRuntime && workspaceContainerId) {
            for (const command of (Array.isArray(resolvedEnvironment.environment.install)
              ? resolvedEnvironment.environment.install
              : [resolvedEnvironment.environment.install])) {
              await dockerRuntime.exec({
                containerId: workspaceContainerId,
                workingDir: preparedWorkspace.workingDirectory,
                env: Object.entries(extraEnv).map(([key, value]) => `${key}=${value}`),
                command: ['sh', '-lc', command]
              });
            }
          } else if (resolvedEnvironment.runtimeKind !== 'docker-session') {
            await runEnvironmentCommands({
              commands: resolvedEnvironment.environment.install,
              cwd: preparedWorkspace.workingDirectory,
              env: extraEnv,
              label: 'install'
            });
          }
        }

        if (resolvedEnvironment.environment?.start) {
          updateWorkspacePreparation('running-start-hooks', 75);
          if (resolvedEnvironment.runtimeKind === 'docker-session' && dockerRuntime && workspaceContainerId) {
            for (const command of (Array.isArray(resolvedEnvironment.environment.start)
              ? resolvedEnvironment.environment.start
              : [resolvedEnvironment.environment.start])) {
              await dockerRuntime.exec({
                containerId: workspaceContainerId,
                workingDir: preparedWorkspace.workingDirectory,
                env: Object.entries(extraEnv).map(([key, value]) => `${key}=${value}`),
                command: ['sh', '-lc', command]
              });
            }
          } else if (resolvedEnvironment.runtimeKind !== 'docker-session') {
            await runEnvironmentCommands({
              commands: resolvedEnvironment.environment.start,
              cwd: preparedWorkspace.workingDirectory,
              env: extraEnv,
              label: 'start'
            });
          }
        }

        if (resolvedEnvironment.runtimeKind === 'docker-session' && dockerRuntime && workspaceContainerId) {
          updateWorkspacePreparation('hydrating-desktop', 82);
          const hydration = await hydrateDesktop({
            runtime: dockerRuntime,
            containerId: workspaceContainerId,
            workspace: preparedWorkspace,
            environment: resolvedEnvironment.environment,
            launchMode: options.launchMode
          });
          desktopState = hydration.desktopState;
          languageServers = hydration.languageServers;
          terminalDescriptors = hydration.terminalDescriptors;
          extraEnv.HAPI_DESKTOP_STATE_JSON = JSON.stringify(hydration.desktopState);
          if (hydration.languageServers.length > 0) {
            extraEnv.HAPI_LANGUAGE_SERVERS_JSON = JSON.stringify(hydration.languageServers);
          }
          if (hydration.terminalDescriptors.length > 0) {
            extraEnv.HAPI_TERMINAL_DESCRIPTORS_JSON = JSON.stringify(hydration.terminalDescriptors);
          }
        }

        updateWorkspacePreparation('starting-session', 90, 'starting agent process');

        // In development mode, Bun path aliases only resolve reliably when cwd is cli project root.
        // Keep actual target directory in HAPI_WORKING_DIRECTORY to preserve session behavior.
        const executionCwd = isBunCompiled() ? spawnDirectory : projectPath();
        const execution = resolvedEnvironment.runtimeKind === 'daemon-session'
          ? await startDaemonSessionExecutor({
              runtime: dockerRuntime ?? new DockerCliRuntime(),
              workspace: preparedWorkspace,
              environment: resolvedEnvironment,
              env: extraEnv,
              options,
              sessionLabel: spawnRequestId
            })
          : resolvedEnvironment.runtimeKind === 'docker-session'
          ? await startDockerSessionExecutor({
              runtime: dockerRuntime ?? new DockerCliRuntime(),
              workspace: preparedWorkspace,
              environment: resolvedEnvironment,
              env: extraEnv,
              options,
              sessionLabel: spawnRequestId,
              existingContainerId: workspaceContainerId,
              existingPreviewTargets: workspaceContainerPreviewTargets
            })
          : startHostProcessExecutor({
              executionCwd,
              workingDirectory: spawnDirectory,
              env: extraEnv,
              options
            });

        const MAX_TAIL_CHARS = 4000;
        let stderrTail = '';
        const appendTail = (current: string, chunk: Buffer | string): string => {
          const text = chunk.toString();
          if (!text) {
            return current;
          }
          const combined = current + text;
          return combined.length > MAX_TAIL_CHARS ? combined.slice(-MAX_TAIL_CHARS) : combined;
        };
        const logStderrTail = () => {
          const trimmed = stderrTail.trim();
          if (!trimmed) {
            return;
          }
          logger.debug('[RUNNER RUN] Child stderr tail', trimmed);
        };

        if ('childProcess' in execution) {
          happyProcess = execution.childProcess;
          happyProcess.stderr?.on('data', (data) => {
            stderrTail = appendTail(stderrTail, data);
          });

          let spawnErrorBeforePidCheck: Error | null = null;
          const captureSpawnErrorBeforePidCheck = (error: Error) => {
            spawnErrorBeforePidCheck = error;
          };
          happyProcess.once('error', captureSpawnErrorBeforePidCheck);

          if (!happyProcess.pid) {
            await new Promise((resolve) => setImmediate(resolve));
            const details = [`cwd=${spawnDirectory}`];
            if (spawnErrorBeforePidCheck) {
              details.push(formatSpawnError(spawnErrorBeforePidCheck));
            }
            const errorMessage = `Failed to spawn HAPI process - no PID returned (${details.join('; ')})`;
            logger.debug('[RUNNER RUN] Failed to spawn process - no PID returned', spawnErrorBeforePidCheck ?? null);
            syncCloudRunnerState({
              currentSessionId: null,
              workspacePreparation: buildWorkspacePreparationState('failed'),
              lastWorkspaceError: {
                message: errorMessage,
                at: Date.now()
              },
              status: 'failed',
              lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
            });
            spawnFailed = true;
            await stopStartedServices();
            await cleanupPreparedWorkspace();
            await maybeCleanupWorktree('no-pid');
            return {
              type: 'error',
              errorMessage
            };
          }
          happyProcess.removeListener('error', captureSpawnErrorBeforePidCheck);
        }

        const pid = 'pid' in execution ? execution.pid : process.pid;
        logger.debug(`[RUNNER RUN] Spawned process with PID ${pid}`);
        let observedExitCode: number | null = null;
        let observedExitSignal: NodeJS.Signals | null = null;
        const buildWebhookFailureMessage = (reason: 'timeout' | 'exit-before-webhook' | 'process-error-before-webhook'): string => {
          let message = '';
          if (reason === 'exit-before-webhook') {
            message = `Session process exited before webhook for PID ${pid}`;
          } else if (reason === 'process-error-before-webhook') {
            message = `Session process error before webhook for PID ${pid}`;
          } else {
            message = `Session webhook timeout for PID ${pid}`;
          }

          if (observedExitCode !== null || observedExitSignal) {
            if (observedExitCode !== null) {
              message += ` (exit code ${observedExitCode})`;
            } else {
              message += ` (signal ${observedExitSignal})`;
            }
          }

          const trimmedTail = stderrTail.trim();
          if (trimmedTail) {
            const compactTail = trimmedTail.replace(/\s+/g, ' ');
            const tailForMessage = compactTail.length > 800 ? compactTail.slice(-800) : compactTail;
            message += `. stderr: ${tailForMessage}`;
          }

          return message;
        };

        const trackedSession: TrackedSession = {
          startedBy: 'runner',
          pid,
          executionBackend: options.executionBackend,
          runtimeKind: execution.runtimeKind,
          spawnRequestId,
          workspaceId: preparedWorkspace.workspaceId,
          serviceContainerIds: startedServices.map((service) => service.containerId),
          childProcess: 'childProcess' in execution ? execution.childProcess : undefined,
          containerId: 'containerId' in execution ? execution.containerId : undefined,
          daemonAuthToken: 'daemonAuthToken' in execution ? execution.daemonAuthToken : undefined,
          cleanupPaths: [...preparedWorkspace.cleanupPaths, ...secretCleanupPaths],
          directoryCreated,
          message: directoryCreated && options.directory ? `The path '${options.directory}' did not exist. We created a new folder and spawned a new session there.` : undefined
        };
        applyPreparedMetadata(trackedSession);

        pidToTrackedSession.set(pid, trackedSession);
        syncCloudRunnerState({
          currentSessionId: spawnRequestId,
          lifecycle: 'busy',
          status: 'running',
          workspacePreparation: buildWorkspacePreparationState('starting-session', 100)
        });

        if (happyProcess) {
          happyProcess.on('exit', (code, signal) => {
            observedExitCode = typeof code === 'number' ? code : null;
            observedExitSignal = signal ?? null;
            logger.debug(`[RUNNER RUN] Child PID ${pid} exited with code ${code}, signal ${signal}`);
            if (code !== 0 || signal) {
              logStderrTail();
            }
            const errorAwaiter = pidToErrorAwaiter.get(pid);
            if (errorAwaiter) {
              pidToErrorAwaiter.delete(pid);
              pidToAwaiter.delete(pid);
              errorAwaiter(buildWebhookFailureMessage('exit-before-webhook'));
            }
            onChildExited(pid);
          });

          happyProcess.on('error', (error) => {
            logger.debug(`[RUNNER RUN] Child process error:`, error);
            const errorAwaiter = pidToErrorAwaiter.get(pid);
            if (errorAwaiter) {
              pidToErrorAwaiter.delete(pid);
              pidToAwaiter.delete(pid);
              errorAwaiter(buildWebhookFailureMessage('process-error-before-webhook'));
            }
            onChildExited(pid);
          });
        }

        logger.debug(`[RUNNER RUN] Waiting for session webhook for PID ${pid}`);
        spawnResult = await new Promise<SpawnSessionResult>((resolve) => {
          const timeout = setTimeout(() => {
            pidToAwaiter.delete(pid);
            pidToErrorAwaiter.delete(pid);
            requestIdToAwaiter.delete(spawnRequestId);
            requestIdToErrorAwaiter.delete(spawnRequestId);
            logger.debug(`[RUNNER RUN] Session webhook timeout for PID ${pid}`);
            logStderrTail();
            resolve({
              type: 'error',
              errorMessage: buildWebhookFailureMessage('timeout')
            });
          }, 15_000);

          pidToAwaiter.set(pid, (completedSession) => {
            clearTimeout(timeout);
            pidToErrorAwaiter.delete(pid);
            requestIdToAwaiter.delete(spawnRequestId);
            requestIdToErrorAwaiter.delete(spawnRequestId);
            logger.debug(`[RUNNER RUN] Session ${completedSession.happySessionId} fully spawned with webhook`);
            resolve({
              type: 'success',
              sessionId: completedSession.happySessionId!
            });
          });
          pidToErrorAwaiter.set(pid, (errorMessage) => {
            clearTimeout(timeout);
            resolve({
              type: 'error',
              errorMessage
            });
          });
          requestIdToAwaiter.set(spawnRequestId, (completedSession) => {
            clearTimeout(timeout);
            pidToAwaiter.delete(pid);
            pidToErrorAwaiter.delete(pid);
            requestIdToErrorAwaiter.delete(spawnRequestId);
            resolve({
              type: 'success',
              sessionId: completedSession.happySessionId!
            });
          });
          requestIdToErrorAwaiter.set(spawnRequestId, (errorMessage) => {
            clearTimeout(timeout);
            pidToAwaiter.delete(pid);
            pidToErrorAwaiter.delete(pid);
            requestIdToAwaiter.delete(spawnRequestId);
            resolve({
              type: 'error',
              errorMessage
            });
          });
        });

        if (spawnResult.type === 'error') {
          spawnFailed = true;
          syncCloudRunnerState({
            currentSessionId: null,
            workspacePreparation: buildWorkspacePreparationState('failed'),
            lastWorkspaceError: {
              message: spawnResult.errorMessage,
              at: Date.now()
            },
            status: 'failed',
            lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
          });
          reportSpawnOutcomeToHub?.({
            type: 'error',
            details: {
              message: spawnResult.errorMessage,
              pid,
              exitCode: observedExitCode,
              signal: observedExitSignal
            }
          });
          await stopStartedServices();
          await cleanupPreparedWorkspace();
          if (execution.runtimeKind === 'docker-session' && 'containerId' in execution && execution.containerId) {
            await new DockerCliRuntime().remove(execution.containerId).catch(() => undefined);
          }
          await maybeCleanupWorktree('spawn-error');
        } else {
          const previewTargets = mergePreviewTargets(
            servicePreviewTargets.length > 0 ? servicePreviewTargets : undefined,
            mergePreviewTargets(
              workspaceContainerPreviewTargets,
              'previewTargets' in execution ? execution.previewTargets : undefined
            )
          );
          const repositorySource = preparedWorkspace.source?.repository;
          if (previewTargets || repositorySource || resolvedEnvironment.environmentId) {
            const metadata = trackedSession.happySessionMetadataFromLocalWebhook ?? {
              path: spawnDirectory,
              host: process.env.HAPI_HOSTNAME || os.hostname()
            } as Metadata;
            const nextMetadata: Metadata = {
              ...metadata,
              executionBackend: options.executionBackend ?? metadata.executionBackend,
              runtimeKind: execution.runtimeKind,
              spawnRequestId,
              workspaceId: preparedWorkspace.workspaceId,
              checkpointId: options.checkpointId ?? preparedWorkspace.checkpointId,
              launchMode: options.launchMode,
              repoSyncPolicy: options.repoSyncPolicy,
              repoSyncStatus: repoSyncStatus ?? metadata.repoSyncStatus,
              workspaceBranch: preparedWorkspace.workspaceBranch ?? metadata.workspaceBranch,
              containerId: workspaceContainerId ?? metadata.containerId,
              environmentId: resolvedEnvironment.environmentId,
              environmentVersion: resolvedEnvironment.environment?.version ?? metadata.environmentVersion,
              workspaceMode: workspaceMode ?? metadata.workspaceMode,
              serviceEndpoints: serviceEndpoints.length > 0 ? serviceEndpoints : metadata.serviceEndpoints,
              desktopState: desktopState ?? metadata.desktopState,
              languageServers: languageServers ?? metadata.languageServers,
              terminalDescriptors: terminalDescriptors ?? metadata.terminalDescriptors,
              setupStatus: {
                phase: setupStatusMessage,
                updatedAt: Date.now()
              },
              previewUrls: previewTargets ? mergePreviewTargets(metadata.previewUrls, previewTargets) : metadata.previewUrls,
              repositoryUrl: repositorySource?.url ?? metadata.repositoryUrl,
              repositoryProvider: repositorySource?.provider ?? metadata.repositoryProvider,
              repositoryRef: repositorySource?.ref ?? metadata.repositoryRef,
              repositoryCommit: repositoryCommit ?? repositorySource?.ref?.commit ?? metadata.repositoryCommit
            };
            trackedSession.happySessionMetadataFromLocalWebhook = nextMetadata;
          }
          syncCloudRunnerState({
            workspacePreparation: null,
            lastWorkspaceError: null,
            status: 'running',
            lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
          });
          reportSpawnOutcomeToHub?.({ type: 'success' });
        }

        return spawnResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : (errorMessage === 'workspace_dirty_requires_resume' ? 'workspace_dirty_requires_resume' : undefined);
        const formattedErrorMessage = errorCode === 'workspace_dirty_requires_resume'
          ? 'Persistent workspace contains uncommitted changes and requires resume instead of reset'
          : errorMessage;
        logger.debug('[RUNNER RUN] Failed to spawn session:', error);
        spawnFailed = true;
        syncCloudRunnerState({
          currentSessionId: null,
          workspacePreparation: buildWorkspacePreparationState('failed'),
          lastWorkspaceError: {
            message: formattedErrorMessage,
            ...(errorCode ? { code: errorCode } : {}),
            at: Date.now()
          },
          status: 'failed',
          lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
        });
        await stopStartedServices();
        if (workspaceContainerId) {
          await new DockerCliRuntime().remove(workspaceContainerId).catch(() => undefined);
        }
        await cleanupPreparedWorkspace();
        await maybeCleanupWorktree('exception');
        reportSpawnOutcomeToHub?.({
          type: 'error',
          details: {
            message: `Failed to spawn session: ${formattedErrorMessage}`
          }
        });
        return {
          type: 'error',
          errorMessage: `Failed to spawn session: ${formattedErrorMessage}`,
          errorCode
        };
      } finally {
        activeSpawnCount = Math.max(0, activeSpawnCount - 1);
        syncCloudRunnerState({
          status: spawnFailed
            ? (pidToTrackedSession.size > 0 ? 'running' : 'failed')
            : (pidToTrackedSession.size > 0 ? 'running' : 'idle'),
          lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
        });
      }
    };

    // Stop a session by sessionId or PID fallback
    const stopSession = (sessionId: string): boolean => {
      logger.debug(`[RUNNER RUN] Attempting to stop session ${sessionId}`);

      // Try to find by sessionId first
      for (const [pid, session] of pidToTrackedSession.entries()) {
        if (session.happySessionId === sessionId ||
          (sessionId.startsWith('PID-') && pid === parseInt(sessionId.replace('PID-', '')))) {

        if (session.startedBy === 'runner' && session.childProcess) {
            try {
              void killProcessByChildProcess(session.childProcess);
              logger.debug(`[RUNNER RUN] Requested termination for runner-spawned session ${sessionId}`);
            } catch (error) {
              logger.debug(`[RUNNER RUN] Failed to kill session ${sessionId}:`, error);
            }
          } else {
            // For externally started sessions, try to kill by PID
            try {
              void killProcess(pid);
              logger.debug(`[RUNNER RUN] Requested termination for external session PID ${pid}`);
            } catch (error) {
              logger.debug(`[RUNNER RUN] Failed to kill external session PID ${pid}:`, error);
            }
          }

          if (session.containerId) {
            void new DockerCliRuntime().remove(session.containerId).catch((error) => {
              logger.debug(`[RUNNER RUN] Failed to remove docker session container ${session.containerId}:`, error);
            });
          }

          if (session.serviceContainerIds?.length) {
            for (const serviceContainerId of session.serviceContainerIds) {
              void new DockerCliRuntime().remove(serviceContainerId).catch(() => undefined);
            }
          }
          if (session.cleanupPaths?.length) {
            for (const cleanupPath of session.cleanupPaths) {
              void fs.rm(cleanupPath, { recursive: true, force: true }).catch(() => undefined);
            }
          }

          pidToTrackedSession.delete(pid);
          syncCloudRunnerState({
            currentSessionId: null,
            workspacePreparation: null,
            status: pidToTrackedSession.size > 0 ? 'running' : 'idle',
            lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
          });
          logger.debug(`[RUNNER RUN] Removed session ${sessionId} from tracking`);
          return true;
        }
      }

      logger.debug(`[RUNNER RUN] Session ${sessionId} not found`);
      return false;
    };

    // Handle child process exit
    const onChildExited = (pid: number) => {
      logger.debug(`[RUNNER RUN] Removing exited process PID ${pid} from tracking`);
      const tracked = pidToTrackedSession.get(pid);
      if (tracked?.containerId) {
        void new DockerCliRuntime().remove(tracked.containerId).catch(() => undefined);
      }
      if (tracked?.serviceContainerIds?.length) {
        for (const serviceContainerId of tracked.serviceContainerIds) {
          void new DockerCliRuntime().remove(serviceContainerId).catch(() => undefined);
        }
      }
      if (tracked?.cleanupPaths?.length) {
        for (const cleanupPath of tracked.cleanupPaths) {
          void fs.rm(cleanupPath, { recursive: true, force: true }).catch(() => undefined);
        }
      }
      if (tracked?.spawnRequestId) {
        requestIdToAwaiter.delete(tracked.spawnRequestId);
        requestIdToErrorAwaiter.delete(tracked.spawnRequestId);
      }
      pidToTrackedSession.delete(pid);
      pidToAwaiter.delete(pid);
      pidToErrorAwaiter.delete(pid);
      syncCloudRunnerState({
        currentSessionId: null,
        workspacePreparation: null,
        status: pidToTrackedSession.size > 0 ? 'running' : 'idle',
        lifecycle: pidToTrackedSession.size > 0 ? 'busy' : 'idle'
      });
    };

    // Start control server (local mode only)
    let controlPort = 0;
    let stopControlServer = async () => {};
    if (options.mode === 'local') {
      const controlServer = await startRunnerControlServer({
        getChildren: getCurrentChildren,
        stopSession,
        spawnSession,
        requestShutdown: () => requestShutdown('hapi-cli'),
        onHappySessionWebhook
      });
      controlPort = controlServer.port;
      stopControlServer = controlServer.stop;
    }

    const startedWithCliMtimeMs = getInstalledCliMtimeMs();

    // Write initial runner state (no lock needed for state file)
    const fileState: RunnerLocallyPersistedState = {
      pid: process.pid,
      httpPort: controlPort,
      startTime: new Date().toLocaleString(),
      startedWithCliVersion: packageJson.version,
      startedWithCliMtimeMs,
      runnerLogPath: logger.logFilePath
    };
    if (options.mode === 'local') {
      writeRunnerState(fileState);
      logger.debug('[RUNNER RUN] Runner state written');
    }

    // Prepare initial runner state
    const initialRunnerState: RunnerState = {
      status: 'offline',
      pid: process.pid,
      httpPort: controlPort,
      startedAt: Date.now()
    };

    // Build machine metadata, merging with options.metadata
    const baseMachineMetadata = buildMachineMetadata();
    const mergedMachineMetadata: MachineMetadata = {
      ...baseMachineMetadata,
      ...(options.metadata ?? {})
    };

    // Create API client
    const api = await ApiClient.create();

    // Get or create machine (with retry for transient connection errors)
    const machine = await withRetry(
      () => api.getOrCreateMachine({
        machineId,
        metadata: mergedMachineMetadata,
        runnerState: initialRunnerState
      }),
      {
        maxAttempts: 60,
        minDelay: 1000,
        maxDelay: 30000,
        shouldRetry: isRetryableConnectionError,
        onRetry: (error, attempt, nextDelayMs) => {
          const errorMsg = error instanceof Error ? error.message : String(error)
          logger.debug(`[RUNNER RUN] Failed to register machine (attempt ${attempt}), retrying in ${nextDelayMs}ms: ${errorMsg}`)

          // If hub dropped after startup, opportunistically try to recover it (local mode only).
          if (options.mode === 'local') {
            void maybeAutoStartServer().catch((recoverError) => {
              logger.debug('[RUNNER RUN] Failed to auto-recover hub during machine registration retry', recoverError)
            })
          }
        }
      }
    );
    logger.debug(`[RUNNER RUN] Machine registered: ${machine.id}`);

    // Create realtime machine session
    const apiMachine = api.machineSyncClient(machine);

    // Set RPC handlers
    apiMachine.setRPCHandlers({
      spawnSession,
      stopSession,
      requestShutdown: () => requestShutdown('hapi-app'),
      containerList: () => listHaqiContainers(),
      containerStopSession: (containerId) => stopSessionInContainer(containerId),
      containerStop: async (containerId) => { await new DockerCliRuntime().stop(containerId) },
      containerRemove: async (containerId) => {
        const rt = new DockerCliRuntime()
        await rt.stop(containerId).catch(() => {})
        await rt.remove(containerId)
      },
      containerLogs: async (containerId) => new DockerCliRuntime().logs(containerId),
      checkpointCreate: async (params) => {
        const dockerImage = `haqi-checkpoint:${params.checkpointId}`
        try {
          const { execSync } = await import('node:child_process')
          execSync(`docker commit ${params.containerId} ${dockerImage}`, { timeout: 120_000 })
          return { dockerImage, success: true }
        } catch (err) {
          return { dockerImage: '', success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
      checkpointDelete: async (params) => {
        try {
          const { execSync } = await import('node:child_process')
          execSync(`docker rmi ${params.dockerImage}`, { timeout: 30_000 })
          return { success: true }
        } catch {
          return { success: true } // Image may already be gone
        }
      },
      previewForward: async (params) => {
        const session = Array.from(pidToTrackedSession.values())
          .find(s => s.happySessionId === params.sessionId || s.spawnRequestId === params.sessionId)
        if (!session?.containerId) {
          return { status: 502, headers: {}, body: 'Session container not found' }
        }

        const inspect = await new DockerCliRuntime().inspect(session.containerId).catch(() => null)
        const daemonPort = inspect?.portBindings[9876]
        if (!daemonPort) {
          return { status: 502, headers: {}, body: 'Daemon not available' }
        }

        try {
          const url = `http://127.0.0.1:${daemonPort}/preview/proxy`
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.daemonAuthToken ?? ''}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              port: params.port,
              method: params.method,
              path: params.path,
              headers: params.headers,
              body: params.body
            })
          })
          return await response.json() as { status: number; headers: Record<string, string>; body?: string }
        } catch {
          return { status: 502, headers: {}, body: 'Preview proxy failed' }
        }
      }
    });

    // Connect to server
    apiMachine.connect();

    const configuredCapacityTotal = Math.max(
      1,
      Number.parseInt(process.env.HAPI_RUNNER_CAPACITY_TOTAL ?? '1', 10) || 1
    );
    let activeSpawnCount = 0;
    let cloudRunnerCurrentSessionId: string | null | undefined = undefined;
    let cloudRunnerWorkspacePreparation: RunnerState['workspacePreparation'] | null | undefined = undefined;
    let cloudRunnerLastWorkspaceError: RunnerState['lastWorkspaceError'] | null | undefined = undefined;
    let cloudRunnerLastSpawnError: RunnerState['lastSpawnError'] | null | undefined = undefined;
    let cloudRunnerLifecycle: WorkerLifecycle | undefined = undefined;
    let cloudRunnerStatus: string | undefined = undefined;

    const getCurrentTrackedSessionId = (): string | null | undefined => {
      if (cloudRunnerCurrentSessionId !== undefined && cloudRunnerCurrentSessionId !== null) {
        return cloudRunnerCurrentSessionId
      }

      for (const session of pidToTrackedSession.values()) {
        if (session.happySessionId) {
          return session.happySessionId
        }
        if (session.spawnRequestId) {
          return session.spawnRequestId
        }
      }

      return undefined
    };

    const syncCloudRunnerState = (patch: {
      currentSessionId?: string | null
      workspacePreparation?: RunnerState['workspacePreparation'] | null
      lastWorkspaceError?: RunnerState['lastWorkspaceError'] | null
      lastSpawnError?: RunnerState['lastSpawnError'] | null
      lifecycle?: WorkerLifecycle
      status?: string
      shutdownRequestedAt?: number
      shutdownSource?: string
    } = {}) => {
      if (patch.currentSessionId !== undefined) {
        cloudRunnerCurrentSessionId = patch.currentSessionId
      }
      if (patch.workspacePreparation !== undefined) {
        cloudRunnerWorkspacePreparation = patch.workspacePreparation
      }
      if (patch.lastWorkspaceError !== undefined) {
        cloudRunnerLastWorkspaceError = patch.lastWorkspaceError
      }
      if (patch.lastSpawnError !== undefined) {
        cloudRunnerLastSpawnError = patch.lastSpawnError
      }
      if (patch.lifecycle !== undefined) {
        cloudRunnerLifecycle = patch.lifecycle
      }
      if (patch.status !== undefined) {
        cloudRunnerStatus = patch.status
      }

      void apiMachine.updateRunnerState((state: RunnerState | null) => buildCloudRunnerStateSnapshot({
        baseState: state,
        pid: process.pid,
        httpPort: controlPort,
        usedSessions: pidToTrackedSession.size + activeSpawnCount,
        startedAt: state?.startedAt,
        currentSessionId: getCurrentTrackedSessionId(),
        status: cloudRunnerStatus,
        lifecycle: cloudRunnerLifecycle,
        workspacePreparation: cloudRunnerWorkspacePreparation,
        lastWorkspaceError: cloudRunnerLastWorkspaceError,
        lastSpawnError: cloudRunnerLastSpawnError,
        lastHeartbeatAt: Date.now(),
        shutdownRequestedAt: patch.shutdownRequestedAt,
        shutdownSource: patch.shutdownSource,
        capacityTotal: configuredCapacityTotal
      })).catch((error) => {
        logger.debug('[RUNNER RUN] Failed to update runner state', error);
      });
    };

    reportSpawnOutcomeToHub = (outcome) => {
      if (outcome.type === 'success') {
        syncCloudRunnerState({
          lastSpawnError: null
        });
        return;
      }

      syncCloudRunnerState({
        lastSpawnError: {
          message: outcome.details.message,
          pid: outcome.details.pid,
          exitCode: outcome.details.exitCode ?? null,
          signal: outcome.details.signal ?? null,
          at: Date.now()
        }
      });
    };

    // Every 60 seconds:
    // 1. Prune stale sessions
    // 2. Check if runner needs update
    // 3. If outdated, restart with latest version
    // 4. Write heartbeat
    const heartbeatIntervalMs = parseInt(process.env.HAPI_RUNNER_HEARTBEAT_INTERVAL || '60000');
    let heartbeatRunning = false
    const restartOnStaleVersionAndHeartbeat = setInterval(async () => {
      if (heartbeatRunning) {
        return;
      }
      heartbeatRunning = true;

      if (process.env.DEBUG) {
        logger.debug(`[RUNNER RUN] Health check started at ${new Date().toLocaleString()}`);
      }

      // Prune stale sessions
      for (const [pid, _] of pidToTrackedSession.entries()) {
        if (!isProcessAlive(pid)) {
          logger.debug(`[RUNNER RUN] Removing stale session with PID ${pid} (process no longer exists)`);
          pidToTrackedSession.delete(pid);
        }
      }

      // Check if runner needs update (local mode only — remote workers do not self-restart)
      if (options.mode === 'local') {
        const installedCliMtimeMs = getInstalledCliMtimeMs();
        if (typeof installedCliMtimeMs === 'number' &&
            typeof startedWithCliMtimeMs === 'number' &&
            installedCliMtimeMs !== startedWithCliMtimeMs) {
          logger.debug('[RUNNER RUN] Runner is outdated, triggering self-restart with latest version, clearing heartbeat interval');

          clearInterval(restartOnStaleVersionAndHeartbeat);

          try {
            spawnHappyCLI(['runner', 'start'], {
              detached: true,
              stdio: 'ignore'
            });
          } catch (error) {
            logger.debug('[RUNNER RUN] Failed to spawn new runner, this is quite likely to happen during integration tests as we are cleaning out dist/ directory', error);
          }

          logger.debug('[RUNNER RUN] Hanging for a bit - waiting for CLI to kill us because we are running outdated version of the code');
          await new Promise(resolve => setTimeout(resolve, 10_000));
          process.exit(0);
        }
      }

      if (options.mode === 'local') {
        // Before wrecklessly overriting the runner state file, we should check if we are the ones who own it
        // Race condition is possible, but thats okay for the time being :D
        const runnerState = await readRunnerState();
        if (runnerState && runnerState.pid !== process.pid) {
          logger.debug('[RUNNER RUN] Somehow a different runner was started without killing us. We should kill ourselves.')
          requestShutdown('exception', 'A different runner was started without killing us. We should kill ourselves.')
        }

        // Heartbeat
        try {
          const updatedState: RunnerLocallyPersistedState = {
            pid: process.pid,
            httpPort: controlPort,
            startTime: fileState.startTime,
            startedWithCliVersion: packageJson.version,
            startedWithCliMtimeMs,
            lastHeartbeat: new Date().toLocaleString(),
            runnerLogPath: fileState.runnerLogPath
          };
          writeRunnerState(updatedState);
          if (process.env.DEBUG) {
            logger.debug(`[RUNNER RUN] Health check completed at ${updatedState.lastHeartbeat}`);
          }
        } catch (error) {
          logger.debug('[RUNNER RUN] Failed to write heartbeat', error);
        }
      }

      heartbeatRunning = false;
    }, heartbeatIntervalMs); // Every 60 seconds in production

    // Setup signal handlers
    const cleanupAndShutdown = async (source: 'hapi-app' | 'hapi-cli' | 'os-signal' | 'exception', errorMessage?: string) => {
      logger.debug(`[RUNNER RUN] Starting proper cleanup (source: ${source}, errorMessage: ${errorMessage})...`);

      // Clear health check interval
      if (restartOnStaleVersionAndHeartbeat) {
        clearInterval(restartOnStaleVersionAndHeartbeat);
        logger.debug('[RUNNER RUN] Health check interval cleared');
      }

      // For remote workers, kill all child session processes before disconnecting
      if (options.mode === 'remote') {
        for (const [pid, tracked] of pidToTrackedSession.entries()) {
          logger.debug(`[RUNNER RUN] Killing child session PID ${pid} (session: ${tracked.happySessionId ?? 'unknown'})`);
          try {
            if (tracked.childProcess) {
              killProcessByChildProcess(tracked.childProcess);
            } else {
              killProcess(pid);
            }
          } catch (error) {
            logger.debug(`[RUNNER RUN] Failed to kill child PID ${pid}`, error);
          }
        }
      }

      // Update runner state before shutting down
      await apiMachine.updateRunnerState((state: RunnerState | null) => ({
        ...state,
        status: 'shutting-down',
        shutdownRequestedAt: Date.now(),
        shutdownSource: source
      }));

      // Give time for metadata update to send
      await new Promise(resolve => setTimeout(resolve, 100));

      apiMachine.shutdown();
      await stopControlServer();
      await cleanupRunnerState();
      await releaseRunnerLock(runnerLockHandle);

      logger.debug('[RUNNER RUN] Cleanup completed, exiting process');
      process.exit(0);
    };

    logger.debug('[RUNNER RUN] Runner started successfully, waiting for shutdown request');

    // Wait for shutdown request
    const shutdownRequest = await resolvesWhenShutdownRequested;
    await cleanupAndShutdown(shutdownRequest.source, shutdownRequest.errorMessage);
}
