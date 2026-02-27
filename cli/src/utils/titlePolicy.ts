const TRAILING_PUNCTUATION_RE = /[。．.!?！？…]+$/u;

const LOW_SIGNAL_TITLES = new Set([
    'commit',
    'commit change',
    'commit changes',
    'git commit',
    'git commit change',
    'git commit changes',
    '提交更改',
    '提交修改',
    '提交代码'
]);

export function normalizeTitleCandidate(value: string): string {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(TRAILING_PUNCTUATION_RE, '')
        .trim();
}

export function isLowSignalTitle(value: string): boolean {
    const normalized = normalizeTitleCandidate(value);
    if (!normalized) {
        return true;
    }
    return LOW_SIGNAL_TITLES.has(normalized.toLowerCase());
}
