import { useState } from 'react'
import {
    CursorButton,
    CursorEmptyState,
    CursorIconButton,
    CursorSearchField,
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsSection,
    CursorTabButton,
    CursorTextArea,
} from '@/components/settings/CursorSettingsPrimitives'

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
        <CursorSettingsCard className="border-[var(--border-secondary)] px-4 py-3 shadow-none">
            <div className="text-[12px] leading-4 text-[var(--text-secondary)]">{props.label}</div>
            <div className="mt-0.5 flex items-center gap-1">
                <span className="text-xl font-semibold text-[var(--text-primary)]">{props.value}</span>
                {props.link && (
                    <span className="text-[var(--text-secondary)]">→</span>
                )}
            </div>
        </CursorSettingsCard>
    )
}

function TemplateCard(props: { template: AutomationTemplate; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className="flex flex-col gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-editor)] p-4 text-left transition-colors hover:bg-[var(--bg-quaternary)] hover:border-[var(--border-secondary)]"
        >
            <span className="text-lg">{props.template.icon}</span>
            <div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{props.template.title}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
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
        <div className="mx-auto w-full max-w-content">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <CursorSettingsHeader
                        title="Automations"
                        description="Automate repetitive tasks with always-on cloud agents that respond to environment triggers."
                    />
                </div>
                <CursorButton
                    type="button"
                    className="shrink-0"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Automation
                </CursorButton>
            </div>

            <CursorSettingsSection className="mb-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Total Automations" value={0} />
                    <StatCard label="Successful · 7d" value={0} />
                    <StatCard label="Failed · 7d" value={0} />
                    <StatCard label="Run History" value="" link />
                </div>
            </CursorSettingsSection>

            <CursorSettingsSection className="mb-6">
                <CursorSettingsCard className="overflow-hidden border-[var(--border-secondary)] shadow-none">
                    <CursorTextArea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Review every new pull request for security issues, then post a concise risk summary as a PR comment"
                        rows={3}
                        className="w-full resize-none border-0 bg-transparent px-4 py-3 shadow-none focus:ring-0"
                    />
                    <div className="flex justify-end px-3 pb-2">
                        <CursorIconButton
                            type="button"
                            disabled={!prompt.trim()}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </CursorIconButton>
                    </div>
                </CursorSettingsCard>
            </CursorSettingsSection>

            <div className="mb-4 flex items-center gap-4 border-b border-[var(--border-tertiary)]">
                <CursorTabButton
                    active={activeTab === 'mine'}
                    onClick={() => setActiveTab('mine')}
                >
                    Mine
                </CursorTabButton>
                <CursorTabButton
                    active={activeTab === 'all'}
                    onClick={() => setActiveTab('all')}
                >
                    All
                </CursorTabButton>
                <div className="flex-1" />
                <div className="w-48 pb-2">
                    <CursorSearchField placeholder="Search automations" compact />
                </div>
            </div>

            <CursorSettingsSection className="mb-8">
                <CursorEmptyState
                    title="No Automations Yet"
                    description="Run agents on a schedule or automatically in response to events. Billed at plan rates."
                    action={<CursorButton type="button" variant="outline">Create Automation</CursorButton>}
                />
            </CursorSettingsSection>

            <div>
                <h2 className="mb-3 text-[13px] font-semibold text-[var(--text-secondary)]">Most popular automations</h2>
                <div className="grid gap-3 md:grid-cols-2">
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
