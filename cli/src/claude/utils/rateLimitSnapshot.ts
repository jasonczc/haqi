import type { ClaudeRateLimitEntry, ClaudeRateLimitSnapshot, ClaudeRateLimitType } from '@hapi/protocol/schemas';

// Mirrors a subset of cc's SDKRateLimitInfoSchema. We accept the wider shape
// from the SDK and pick what we need.
export type SdkRateLimitInfo = {
    status: 'allowed' | 'allowed_warning' | 'rejected';
    rateLimitType?: ClaudeRateLimitType | string;
    utilization?: number;
    resetsAt?: number;
    overageStatus?: 'allowed' | 'allowed_warning' | 'rejected';
    isUsingOverage?: boolean;
};

const KNOWN_RATE_LIMIT_TYPES: ReadonlySet<ClaudeRateLimitType> = new Set([
    'five_hour',
    'seven_day',
    'seven_day_opus',
    'seven_day_sonnet',
    'overage'
]);

function isKnownRateLimitType(value: string | undefined): value is ClaudeRateLimitType {
    return typeof value === 'string' && KNOWN_RATE_LIMIT_TYPES.has(value as ClaudeRateLimitType);
}

/**
 * Merge a single SDK rate_limit_event payload into the existing snapshot.
 *
 * The cc SDK only carries the *latest* rateLimitType per event, so callers must
 * preserve other types' entries. Returns a new snapshot object (immutable).
 *
 * If `info.rateLimitType` is absent or unknown, the snapshot is returned
 * unchanged — we don't synthesize a bucket for an unidentified limit.
 */
export function applyRateLimitEvent(
    snapshot: ClaudeRateLimitSnapshot | undefined,
    info: SdkRateLimitInfo,
    now: number = Date.now()
): ClaudeRateLimitSnapshot {
    const base: ClaudeRateLimitSnapshot = snapshot ?? {};
    if (!isKnownRateLimitType(info.rateLimitType)) {
        return base;
    }

    const entry: ClaudeRateLimitEntry = {
        status: info.status,
        observedAt: now
    };
    if (typeof info.utilization === 'number' && info.utilization >= 0 && info.utilization <= 1) {
        entry.utilization = info.utilization;
    }
    if (typeof info.resetsAt === 'number') {
        entry.resetsAt = info.resetsAt;
    }
    if (info.overageStatus) {
        entry.overageStatus = info.overageStatus;
    }
    if (typeof info.isUsingOverage === 'boolean') {
        entry.isUsingOverage = info.isUsingOverage;
    }

    return {
        ...base,
        [info.rateLimitType]: entry
    };
}
