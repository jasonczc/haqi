import { useTranslation, type Locale } from '@/lib/use-translation'
import { getFontScaleOptions, useFontScale, type FontScale } from '@/hooks/useFontScale'
import { useThemePreference, type ThemePreference } from '@/hooks/useTheme'
import { useEnterBehavior } from '@/hooks/useEnterBehavior'
import { useQueueInlinePanel, type QueueInlinePanelMode } from '@/hooks/useQueueInlinePanel'
import { useCodexSendModePreference } from '@/hooks/useCodexSendModePreference'
import { useSessionReopenPositionPreference, type SessionReopenPositionPreference } from '@/hooks/useSessionReopenPositionPreference'
import { useProjectQuickCreate } from '@/hooks/useProjectQuickCreate'
import {
    useImageUploadCompression,
    type ImageUploadCompressionLevel,
    type ImageUploadCompressionTargetSize
} from '@/hooks/useImageUploadCompression'
import { useArchiveConfirmation } from '@/hooks/useArchiveConfirmation'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import {
    CursorSettingsCard,
    CursorSettingsHeader,
    CursorSettingsRow,
    CursorSettingsSection,
    CursorSelect,
    CursorToggle,
} from '@/components/settings/CursorSettingsPrimitives'

const locales: Array<{ value: Locale; label: string }> = [
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
]

const themeOptions: ThemePreference[] = ['light', 'dark', 'system']
const queuePanelModes: QueueInlinePanelMode[] = ['off', 'compact', 'full']
const sendModes = ['direct', 'queue'] as const
const reopenModes: SessionReopenPositionPreference[] = ['bottom', 'restore', 'bottom-if-unread']
const imageCompressionLevels: ImageUploadCompressionLevel[] = ['light', 'balanced', 'aggressive']
const imageCompressionTargetSizes: ImageUploadCompressionTargetSize[] = ['auto', '500kb', '1mb', '2mb', '5mb']

function formatThemeLabel(value: ThemePreference): string {
    if (value === 'light') return 'Light'
    if (value === 'dark') return 'Dark'
    return 'System'
}

function formatQueueLabel(value: QueueInlinePanelMode): string {
    if (value === 'off') return 'Hidden'
    if (value === 'compact') return 'Compact'
    return 'Expanded'
}

function formatSendModeLabel(value: (typeof sendModes)[number]): string {
    return value === 'queue' ? 'Queue' : 'Direct'
}

function formatReopenLabel(value: SessionReopenPositionPreference): string {
    if (value === 'restore') return 'Restore previous position'
    if (value === 'bottom-if-unread') return 'Bottom if unread'
    return 'Always jump to bottom'
}

function formatCompressionLevel(value: ImageUploadCompressionLevel): string {
    if (value === 'light') return 'Light'
    if (value === 'aggressive') return 'Aggressive'
    return 'Balanced'
}

function formatCompressionTarget(value: ImageUploadCompressionTargetSize): string {
    if (value === 'auto') return 'Auto'
    return value.toUpperCase()
}

export default function SettingsGeneralPage() {
    const { locale, setLocale } = useTranslation()
    const { fontScale, setFontScale } = useFontScale()
    const { themePreference, setThemePreference } = useThemePreference()
    const { enterBehavior, setEnterBehavior } = useEnterBehavior()
    const { queueInlinePanelMode, setQueueInlinePanelMode } = useQueueInlinePanel()
    const { codexSendModeDefault, setCodexSendModeDefault } = useCodexSendModePreference()
    const { sessionReopenPosition, setSessionReopenPosition } = useSessionReopenPositionPreference()
    const { projectQuickCreateEnabled, setProjectQuickCreateEnabled } = useProjectQuickCreate()
    const { skipArchiveConfirmation, setSkipArchiveConfirmation } = useArchiveConfirmation()
    const {
        imageUploadCompressionEnabled,
        imageUploadCompressionLevel,
        imageUploadCompressionTargetSize,
        setImageUploadCompressionEnabled,
        setImageUploadCompressionLevel,
        setImageUploadCompressionTargetSize
    } = useImageUploadCompression()
    const fontScaleOptions = getFontScaleOptions()

    return (
        <>
            <CursorSettingsHeader
                title="General"
                description="Personal defaults for language, appearance, composer behavior, and Codex queue controls."
            />

            <CursorSettingsSection title="Appearance">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Language"
                        description="Select the UI language used in the web app."
                        control={
                            <CursorSelect value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                                {locales.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                    <CursorSettingsRow
                        title="Theme"
                        description="Choose light, dark, or system appearance."
                        control={
                            <CursorSelect value={themePreference} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}>
                                {themeOptions.map((option) => (
                                    <option key={option} value={option}>{formatThemeLabel(option)}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                    <CursorSettingsRow
                        title="Font scale"
                        description="Increase or decrease overall reading density."
                        noBorder
                        control={
                            <CursorSelect value={fontScale} onChange={(event) => setFontScale(event.target.value as unknown as FontScale)}>
                                {fontScaleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Composer">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Enter key behavior"
                        description="Control whether Enter sends immediately or inserts a newline."
                        control={
                            <CursorSelect value={enterBehavior} onChange={(event) => setEnterBehavior(event.target.value as typeof enterBehavior)}>
                                <option value="send">Send message</option>
                                <option value="newline">Insert newline</option>
                            </CursorSelect>
                        }
                    />
                    <CursorSettingsRow
                        title="Inline queue panel"
                        description="Show Codex queue state inline above the composer."
                        control={
                            <CursorSelect value={queueInlinePanelMode} onChange={(event) => setQueueInlinePanelMode(event.target.value as QueueInlinePanelMode)}>
                                {queuePanelModes.map((option) => (
                                    <option key={option} value={option}>{formatQueueLabel(option)}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                    <CursorSettingsRow
                        title="Default Codex send mode"
                        description="Choose whether Codex messages run immediately or enter the queue by default."
                        control={
                            <CursorSelect value={codexSendModeDefault} onChange={(event) => setCodexSendModeDefault(event.target.value as (typeof sendModes)[number])}>
                                {sendModes.map((option) => (
                                    <option key={option} value={option}>{formatSendModeLabel(option)}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                    <CursorSettingsRow
                        title="Reopen session position"
                        description="Choose where the timeline lands when a session is reopened."
                        noBorder
                        control={
                            <CursorSelect value={sessionReopenPosition} onChange={(event) => setSessionReopenPosition(event.target.value as SessionReopenPositionPreference)}>
                                {reopenModes.map((option) => (
                                    <option key={option} value={option}>{formatReopenLabel(option)}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Workflow">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Project quick create"
                        description="Start a new session from the current project context without extra setup."
                        control={<CursorToggle checked={projectQuickCreateEnabled} onCheckedChange={setProjectQuickCreateEnabled} />}
                    />
                    <CursorSettingsRow
                        title="Skip archive confirmation"
                        description="Archive sessions immediately without showing the confirmation dialog."
                        noBorder
                        control={<CursorToggle checked={skipArchiveConfirmation} onCheckedChange={setSkipArchiveConfirmation} />}
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="Uploads">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Compress uploaded images"
                        description="Reduce screenshot and image size before upload."
                        control={<CursorToggle checked={imageUploadCompressionEnabled} onCheckedChange={setImageUploadCompressionEnabled} />}
                    />
                    <CursorSettingsRow
                        title="Compression level"
                        description="Trade off quality and file size for inline screenshots."
                        control={
                            <CursorSelect
                                value={imageUploadCompressionLevel}
                                onChange={(event) => setImageUploadCompressionLevel(event.target.value as ImageUploadCompressionLevel)}
                                disabled={!imageUploadCompressionEnabled}
                            >
                                {imageCompressionLevels.map((option) => (
                                    <option key={option} value={option}>{formatCompressionLevel(option)}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                    <CursorSettingsRow
                        title="Target upload size"
                        description="Optional soft cap for compressed image payloads."
                        noBorder
                        control={
                            <CursorSelect
                                value={imageUploadCompressionTargetSize}
                                onChange={(event) => setImageUploadCompressionTargetSize(event.target.value as ImageUploadCompressionTargetSize)}
                                disabled={!imageUploadCompressionEnabled}
                            >
                                {imageCompressionTargetSizes.map((option) => (
                                    <option key={option} value={option}>{formatCompressionTarget(option)}</option>
                                ))}
                            </CursorSelect>
                        }
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>

            <CursorSettingsSection title="About">
                <CursorSettingsCard>
                    <CursorSettingsRow
                        title="Protocol version"
                        description="Web client compatibility version used by hub and runner."
                        control={<span className="text-[13px] leading-[18px] text-[var(--text-secondary)]">{PROTOCOL_VERSION}</span>}
                        noBorder
                    />
                </CursorSettingsCard>
            </CursorSettingsSection>
        </>
    )
}
