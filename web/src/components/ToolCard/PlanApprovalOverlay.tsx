import type { ApiClient } from '@/api/client'
import type { ChatToolCall } from '@/chat/types'
import { PermissionFooter } from '@/components/ToolCard/PermissionFooter'
import { getExitPlanText, isExitPlanToolName } from '@/components/ToolCard/exitPlanMode'
import type { SessionMetadataSummary } from '@/types/api'

export function PlanApprovalOverlay(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    tool: ChatToolCall | null
    disabled: boolean
    onDone: () => void
}) {
    const tool = props.tool
    if (!tool || !isExitPlanToolName(tool.name) || tool.permission?.status !== 'pending') {
        return null
    }

    const plan = getExitPlanText(tool.input)

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto w-full max-w-3xl rounded-[10px] border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-card)] shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)]">
                <div className="max-h-[65vh] overflow-y-auto p-3">
                    <div className="text-[13px] font-semibold text-[var(--cursor-text-primary)]">Plan approval</div>
                    <div className="mt-1 text-[11.5px] text-[var(--cursor-text-secondary)]">Review the proposed plan below and choose whether to continue.</div>
                    {plan ? (
                        <div className="mt-3 rounded-md border border-[var(--cursor-stroke-primary)] bg-[var(--cursor-bg-quiet)] p-2.5">
                            <div className="whitespace-pre-wrap break-words text-sm text-[var(--cursor-text-primary)]">{plan}</div>
                        </div>
                    ) : null}
                    <div className="mt-3 border-t border-[var(--cursor-stroke-primary)] pt-3">
                        <PermissionFooter
                            api={props.api}
                            sessionId={props.sessionId}
                            metadata={props.metadata}
                            tool={tool}
                            disabled={props.disabled}
                            onDone={props.onDone}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
