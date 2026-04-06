import { useState } from 'react'

type AutomationTemplate = {
    icon: string
    title: string
    description: string
}

const TEMPLATES: AutomationTemplate[] = [
    {
        icon: '🛡',
        title: 'Find vulnerabilities',
        description: 'Review pull requests for exploitable security issues and flag only validated findings before merge'
    },
    {
        icon: '👥',
        title: 'Assign PR reviewers',
        description: 'Assign reviewers based on code changes and auto-approve low-risk PRs'
    },
    {
        icon: '📧',
        title: 'Summarize daily changes',
        description: 'Every weekday morning, summarize high-level code changes from merged PRs and post a changelog update'
    },
    {
        icon: '🔧',
        title: 'Fix failing tests',
        description: 'When CI fails on a PR, automatically create a fix commit for common test failures'
    },
    {
        icon: '📝',
        title: 'Update documentation',
        description: 'When API endpoints change, automatically update related documentation files'
    },
    {
        icon: '🏷',
        title: 'Auto-label PRs',
        description: 'Automatically add labels to pull requests based on changed files and commit messages'
    }
]

function StatCard(props: { label: string; value: string | number; link?: boolean }) {
    return (
        <div className="rounded-lg border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-app)] px-4 py-3">
            <div className="text-[12px] text-[var(--cursor-text-secondary)]">{props.label}</div>
            <div className="mt-0.5 flex items-center gap-1">
                <span className="text-xl font-semibold text-[var(--cursor-text-primary)]">{props.value}</span>
                {props.link && (
                    <span className="text-[var(--cursor-text-secondary)]">→</span>
                )}
            </div>
        </div>
    )
}

function TemplateCard(props: { template: AutomationTemplate; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className="flex flex-col gap-2 rounded-lg border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-app)] p-4 text-left transition-colors hover:bg-[var(--cursor-bg-quiet)] hover:border-[var(--cursor-stroke-primary)]"
        >
            <span className="text-lg">{props.template.icon}</span>
            <div>
                <div className="text-[13px] font-semibold text-[var(--cursor-text-primary)]">{props.template.title}</div>
                <div className="mt-0.5 text-[12px] text-[var(--cursor-text-secondary)] leading-relaxed">
                    {props.template.description}
                </div>
            </div>
        </button>
    )
}

export default function CloudAutomationsPage() {
    const [activeTab, setActiveTab] = useState<'mine' | 'all'>('mine')
    const [prompt, setPrompt] = useState('')

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--cursor-text-primary)]">Automations</h1>
                    <p className="mt-1 text-[13px] text-[var(--cursor-text-secondary)]">
                        Automate repetitive tasks with always-on cloud agents that respond to environment triggers.
                    </p>
                </div>
                <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg bg-[var(--cursor-button)] px-4 py-2 text-[13px] font-medium text-[var(--cursor-button-text)] transition-colors hover:opacity-90"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Automation
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                <StatCard label="Total Automations" value={0} />
                <StatCard label="Successful · 7d" value={0} />
                <StatCard label="Failed · 7d" value={0} />
                <StatCard label="Run History" value="" link />
            </div>

            {/* NLP prompt input */}
            <div className="mb-6">
                <div className="relative rounded-lg border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-app)] overflow-hidden">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Review every new pull request for security issues, then post a concise risk summary as a PR comment"
                        rows={3}
                        className="w-full resize-none bg-transparent px-4 py-3 text-sm text-[var(--cursor-text-primary)] placeholder:text-[var(--cursor-text-secondary)] focus:outline-none"
                    />
                    <div className="flex justify-end px-3 pb-2">
                        <button
                            type="button"
                            disabled={!prompt.trim()}
                            className="rounded-full bg-[var(--cursor-button)] p-2 text-[var(--cursor-button-text)] transition-colors disabled:opacity-30"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 border-b border-[var(--cursor-stroke-secondary)] mb-4">
                <button
                    type="button"
                    onClick={() => setActiveTab('mine')}
                    className={`relative pb-2 text-[13px] font-medium transition-colors ${
                        activeTab === 'mine' ? 'text-[var(--cursor-text-primary)]' : 'text-[var(--cursor-text-secondary)] hover:text-[var(--cursor-text-primary)]'
                    }`}
                >
                    Mine
                    {activeTab === 'mine' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--cursor-text-primary)]" />}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`relative pb-2 text-[13px] font-medium transition-colors ${
                        activeTab === 'all' ? 'text-[var(--cursor-text-primary)]' : 'text-[var(--cursor-text-secondary)] hover:text-[var(--cursor-text-primary)]'
                    }`}
                >
                    All
                    {activeTab === 'all' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--cursor-text-primary)]" />}
                </button>
                <div className="flex-1" />
                <button
                    type="button"
                    className="pb-2 text-[var(--cursor-text-secondary)] hover:text-[var(--cursor-text-primary)] transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </button>
            </div>

            {/* Empty state */}
            <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--cursor-stroke-secondary)] bg-[var(--cursor-bg-quiet)] py-16 mb-8">
                <div className="text-[15px] font-semibold text-[var(--cursor-text-primary)]">No Automations Yet</div>
                <div className="mt-1 text-[13px] text-[var(--cursor-text-secondary)] text-center max-w-xs">
                    Run agents on a schedule or automatically in response to events. Billed at plan rates.
                </div>
                <button
                    type="button"
                    className="mt-4 rounded-md border border-[var(--cursor-stroke-primary)] px-4 py-2 text-[13px] font-medium text-[var(--cursor-text-primary)] transition-colors hover:bg-[var(--cursor-bg-secondary)]"
                >
                    Create Automation
                </button>
            </div>

            {/* Templates */}
            <div>
                <h2 className="text-[13px] font-semibold text-[var(--cursor-text-secondary)] mb-3">Most popular automations</h2>
                <div className="grid grid-cols-2 gap-3">
                    {TEMPLATES.map(template => (
                        <TemplateCard
                            key={template.title}
                            template={template}
                            onClick={() => setPrompt(template.description)}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
