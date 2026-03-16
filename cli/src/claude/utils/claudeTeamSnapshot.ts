import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { TeamMember, TeamState, TeamTask } from '@/api/types';

type ClaudeTeamConfig = {
    name?: string;
    description?: string;
    leadSessionId?: string;
    members?: Array<{
        name?: string;
        agentType?: string;
    }>;
};

type ClaudeTaskRecord = {
    id?: string;
    subject?: string;
    description?: string;
    status?: string;
};

function getClaudeConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

function safeReadJson<T>(path: string): T | null {
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as T;
    } catch {
        return null;
    }
}

function normalizeTaskStatus(value: unknown): TeamTask['status'] {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'completed' || normalized === 'done') return 'completed';
    if (normalized === 'blocked') return 'blocked';
    if (normalized === 'in_progress' || normalized === 'in-progress' || normalized === 'running' || normalized === 'active') {
        return 'in_progress';
    }
    return 'pending';
}

export function readClaudeTeamSnapshotForSession(sessionId: string): TeamState | null {
    if (!sessionId) {
        return null;
    }

    const claudeDir = getClaudeConfigDir();
    const teamsDir = join(claudeDir, 'teams');
    if (!existsSync(teamsDir)) {
        return null;
    }

    for (const teamDirEntry of readdirSync(teamsDir, { withFileTypes: true })) {
        if (!teamDirEntry.isDirectory()) continue;
        const configPath = join(teamsDir, teamDirEntry.name, 'config.json');
        if (!existsSync(configPath)) continue;
        const config = safeReadJson<ClaudeTeamConfig>(configPath);
        if (!config || config.leadSessionId !== sessionId) continue;

        const teamName = typeof config.name === 'string' && config.name.trim().length > 0
            ? config.name.trim()
            : teamDirEntry.name;
        const description = typeof config.description === 'string' && config.description.trim().length > 0
            ? config.description.trim()
            : undefined;

        const tasksDir = join(claudeDir, 'tasks', teamName);
        const tasks: TeamTask[] = [];
        const memberMap = new Map<string, TeamMember>();

        for (const member of Array.isArray(config.members) ? config.members : []) {
            if (!member || typeof member.name !== 'string' || member.name.trim().length === 0) continue;
            memberMap.set(member.name.trim(), {
                name: member.name.trim(),
                ...(typeof member.agentType === 'string' && member.agentType.trim().length > 0
                    ? { agentType: member.agentType.trim() }
                    : {})
            });
        }

        if (existsSync(tasksDir)) {
            for (const file of readdirSync(tasksDir, { withFileTypes: true })) {
                if (!file.isFile() || !file.name.endsWith('.json')) continue;
                const task = safeReadJson<ClaudeTaskRecord>(join(tasksDir, file.name));
                if (!task || typeof task.id !== 'string') continue;

                const subject = typeof task.subject === 'string' && task.subject.trim().length > 0
                    ? task.subject.trim()
                    : undefined;
                const title = subject
                    ?? (typeof task.description === 'string' && task.description.trim().length > 0
                        ? task.description.trim()
                        : `Task ${task.id}`);
                const status = normalizeTaskStatus(task.status);

                tasks.push({
                    id: `${teamName}:${task.id}`,
                    title,
                    ...(typeof task.description === 'string' && task.description.trim().length > 0
                        ? { description: task.description.trim() }
                        : {}),
                    ...(subject ? { owner: subject } : {}),
                    status
                });

                if (subject) {
                    const previous = memberMap.get(subject);
                    const derivedStatus = status === 'completed' ? 'idle' : status === 'blocked' ? 'idle' : 'active';
                    // If member already has 'active' status from another task, don't downgrade to 'idle'
                    const memberStatus = previous?.status === 'active' ? 'active' : derivedStatus;
                    memberMap.set(subject, {
                        ...previous,
                        name: subject,
                        status: memberStatus
                    });
                }
            }
        }

        return {
            teamName,
            ...(description ? { description } : {}),
            members: [...memberMap.values()],
            tasks,
            updatedAt: Date.now()
        };
    }

    return null;
}
