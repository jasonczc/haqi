type TurnCompletionStatus = 'completed' | 'aborted' | 'failed';

type ParsedDiffFile = {
    path: string;
    unifiedDiff: string;
    additions: number;
    deletions: number;
};

type TurnChangeFile = {
    path: string;
    additions: number;
    deletions: number;
    unified_diff?: string;
};

type TurnChangeSummaryInput = {
    status: TurnCompletionStatus;
    files: TurnChangeFile[];
    patch_apply: {
        total: number;
        success: number;
        failed: number;
    };
    diff_stats: {
        additions: number;
        deletions: number;
        available: boolean;
    };
    scope: 'event-level';
    source: 'codex-patch-diff-events';
};

function addUnique(items: string[], seen: Set<string>, value: string): void {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    items.push(trimmed);
}

function normalizePathForMatch(path: string): string {
    return path
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
        .trim();
}

function parsePathFromDiffHeader(line: string): string | null {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (!match) return null;
    const fromB = match[2]?.trim();
    return fromB && fromB.length > 0 ? fromB : null;
}

function parsePathFromPlusLine(line: string): string | null {
    const rawPath = line.replace(/^\+\+\+\s+/, '').trim();
    if (!rawPath || rawPath === '/dev/null') return null;
    if (rawPath.startsWith('b/')) return rawPath.slice(2);
    return rawPath;
}

function splitUnifiedDiffByFile(unifiedDiff: string): ParsedDiffFile[] {
    const files: ParsedDiffFile[] = [];

    let currentPath: string | null = null;
    let currentLines: string[] = [];
    let currentAdditions = 0;
    let currentDeletions = 0;

    const flush = () => {
        if (!currentPath || currentLines.length === 0) {
            currentPath = null;
            currentLines = [];
            currentAdditions = 0;
            currentDeletions = 0;
            return;
        }

        files.push({
            path: currentPath,
            unifiedDiff: currentLines.join('\n'),
            additions: currentAdditions,
            deletions: currentDeletions
        });

        currentPath = null;
        currentLines = [];
        currentAdditions = 0;
        currentDeletions = 0;
    };

    const lines = unifiedDiff.split('\n');
    for (const line of lines) {
        if (line.startsWith('diff --git ')) {
            flush();
            currentPath = parsePathFromDiffHeader(line);
            currentLines = [line];
            continue;
        }

        if (currentLines.length === 0) {
            if (!line.trim()) {
                continue;
            }
            currentLines = [line];
        } else {
            currentLines.push(line);
        }

        if (line.startsWith('+++ ')) {
            const path = parsePathFromPlusLine(line);
            if (path) {
                currentPath = path;
            }
            continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
            currentAdditions += 1;
            continue;
        }

        if (line.startsWith('-') && !line.startsWith('---')) {
            currentDeletions += 1;
        }
    }

    flush();

    const merged = new Map<string, ParsedDiffFile>();
    for (const file of files) {
        const existing = merged.get(file.path);
        if (!existing) {
            merged.set(file.path, file);
            continue;
        }

        merged.set(file.path, {
            path: file.path,
            additions: existing.additions + file.additions,
            deletions: existing.deletions + file.deletions,
            unifiedDiff: `${existing.unifiedDiff}\n${file.unifiedDiff}`
        });
    }

    return Array.from(merged.values());
}

function resolvePatchPathWithDiffAliases(patchPath: string, diffPaths: string[]): string {
    const normalizedPatch = normalizePathForMatch(patchPath);
    if (!normalizedPatch) return patchPath;

    const normalizedDiffPairs = diffPaths.map((path) => ({
        raw: path,
        normalized: normalizePathForMatch(path)
    }));

    for (const pair of normalizedDiffPairs) {
        if (pair.normalized === normalizedPatch) {
            return pair.raw;
        }
    }

    const suffixMatches = normalizedDiffPairs
        .filter((pair) => normalizedPatch.endsWith(`/${pair.normalized}`))
        .sort((a, b) => b.normalized.length - a.normalized.length);

    if (suffixMatches.length === 1) {
        return suffixMatches[0].raw;
    }

    if (suffixMatches.length > 1) {
        const best = suffixMatches[0];
        const second = suffixMatches[1];
        if (best.normalized.length > second.normalized.length) {
            return best.raw;
        }
    }

    return patchPath;
}

export class TurnChangeTracker {
    private patchBeginCallIds = new Set<string>();
    private patchEndCallIds = new Set<string>();
    private patchFiles: string[] = [];
    private patchFileSet = new Set<string>();
    private latestDiffFiles: ParsedDiffFile[] = [];

    private patchApplyTotal = 0;
    private patchApplySucceeded = 0;
    private patchApplyFailed = 0;

    reset(): void {
        this.patchBeginCallIds = new Set<string>();
        this.patchEndCallIds = new Set<string>();
        this.patchFiles = [];
        this.patchFileSet = new Set<string>();
        this.latestDiffFiles = [];
        this.patchApplyTotal = 0;
        this.patchApplySucceeded = 0;
        this.patchApplyFailed = 0;
    }

    trackPatchBegin(callId: string | null, changes: Record<string, unknown>): void {
        if (callId) {
            if (this.patchBeginCallIds.has(callId)) return;
            this.patchBeginCallIds.add(callId);
        }

        this.patchApplyTotal += 1;
        for (const filePath of Object.keys(changes)) {
            addUnique(this.patchFiles, this.patchFileSet, filePath);
        }
    }

    trackPatchEnd(callId: string | null, success: boolean): void {
        if (callId) {
            if (this.patchEndCallIds.has(callId)) return;
            this.patchEndCallIds.add(callId);
        }

        if (success) {
            this.patchApplySucceeded += 1;
        } else {
            this.patchApplyFailed += 1;
        }
    }

    trackTurnDiff(unifiedDiff: string): void {
        if (!unifiedDiff) return;
        this.latestDiffFiles = splitUnifiedDiffByFile(unifiedDiff);
    }

    buildToolInput(status: TurnCompletionStatus): TurnChangeSummaryInput {
        const orderedPaths: string[] = [];
        const orderedPathSet = new Set<string>();

        const diffPaths = this.latestDiffFiles.map((file) => file.path);
        for (const path of this.patchFiles) {
            const canonical = resolvePatchPathWithDiffAliases(path, diffPaths);
            addUnique(orderedPaths, orderedPathSet, canonical);
        }

        for (const file of this.latestDiffFiles) {
            addUnique(orderedPaths, orderedPathSet, file.path);
        }

        const latestDiffFileMap = new Map(this.latestDiffFiles.map((file) => [file.path, file]));
        const files: TurnChangeFile[] = orderedPaths.map((path) => {
            const diff = latestDiffFileMap.get(path);
            if (!diff) {
                return {
                    path,
                    additions: 0,
                    deletions: 0
                };
            }
            return {
                path,
                additions: diff.additions,
                deletions: diff.deletions,
                unified_diff: diff.unifiedDiff
            };
        });

        const patchSuccess = this.patchApplySucceeded;
        const patchFailed = this.patchApplyFailed;
        const patchTotal = Math.max(this.patchApplyTotal, patchSuccess + patchFailed);

        const additions = this.latestDiffFiles.reduce((sum, file) => sum + file.additions, 0);
        const deletions = this.latestDiffFiles.reduce((sum, file) => sum + file.deletions, 0);

        return {
            status,
            files,
            patch_apply: {
                total: patchTotal,
                success: patchSuccess,
                failed: patchFailed
            },
            diff_stats: {
                additions,
                deletions,
                available: this.latestDiffFiles.length > 0
            },
            scope: 'event-level',
            source: 'codex-patch-diff-events'
        };
    }
}

export type { TurnCompletionStatus, TurnChangeSummaryInput, TurnChangeFile };
