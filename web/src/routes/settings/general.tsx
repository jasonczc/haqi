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
            <div className="settings-header">
                <h1>General</h1>
                <p>Personal defaults for language, appearance, composer behavior, and Codex queue controls.</p>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Appearance</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Language</span>
                            <span className="settings-row-desc">Select the UI language used in the web app.</span>
                        </div>
                        <div className="settings-row-right">
                            <select className="settings-input" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                                {locales.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Theme</span>
                            <span className="settings-row-desc">Choose light, dark, or system appearance.</span>
                        </div>
                        <div className="settings-row-right">
                            <select className="settings-input" value={themePreference} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}>
                                {themeOptions.map((option) => (
                                    <option key={option} value={option}>{formatThemeLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Font scale</span>
                            <span className="settings-row-desc">Increase or decrease overall reading density.</span>
                        </div>
                        <div className="settings-row-right">
                            <select className="settings-input" value={fontScale} onChange={(event) => setFontScale(event.target.value as unknown as FontScale)}>
                                {fontScaleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Composer</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Enter key behavior</span>
                            <span className="settings-row-desc">Control whether Enter sends immediately or inserts a newline.</span>
                        </div>
                        <div className="settings-row-right">
                            <select className="settings-input" value={enterBehavior} onChange={(event) => setEnterBehavior(event.target.value as typeof enterBehavior)}>
                                <option value="send">Send message</option>
                                <option value="newline">Insert newline</option>
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Inline queue panel</span>
                            <span className="settings-row-desc">Show Codex queue state inline above the composer.</span>
                        </div>
                        <div className="settings-row-right">
                            <select className="settings-input" value={queueInlinePanelMode} onChange={(event) => setQueueInlinePanelMode(event.target.value as QueueInlinePanelMode)}>
                                {queuePanelModes.map((option) => (
                                    <option key={option} value={option}>{formatQueueLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Default Codex send mode</span>
                            <span className="settings-row-desc">Choose whether Codex messages run immediately or enter the queue by default.</span>
                        </div>
                        <div className="settings-row-right">
                            <select className="settings-input" value={codexSendModeDefault} onChange={(event) => setCodexSendModeDefault(event.target.value as (typeof sendModes)[number])}>
                                {sendModes.map((option) => (
                                    <option key={option} value={option}>{formatSendModeLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Reopen session position</span>
                            <span className="settings-row-desc">Choose where the timeline lands when a session is reopened.</span>
                        </div>
                        <div className="settings-row-right">
                            <select className="settings-input" value={sessionReopenPosition} onChange={(event) => setSessionReopenPosition(event.target.value as SessionReopenPositionPreference)}>
                                {reopenModes.map((option) => (
                                    <option key={option} value={option}>{formatReopenLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Workflow</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Project quick create</span>
                            <span className="settings-row-desc">Start a new session from the current project context without extra setup.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input type="checkbox" checked={projectQuickCreateEnabled} onChange={() => setProjectQuickCreateEnabled(!projectQuickCreateEnabled)} />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Skip archive confirmation</span>
                            <span className="settings-row-desc">Archive sessions immediately without showing the confirmation dialog.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input type="checkbox" checked={skipArchiveConfirmation} onChange={() => setSkipArchiveConfirmation(!skipArchiveConfirmation)} />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Uploads</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Compress uploaded images</span>
                            <span className="settings-row-desc">Reduce screenshot and image size before upload.</span>
                        </div>
                        <div className="settings-row-right">
                            <label className="settings-toggle">
                                <input type="checkbox" checked={imageUploadCompressionEnabled} onChange={() => setImageUploadCompressionEnabled(!imageUploadCompressionEnabled)} />
                                <span className="settings-toggle-slider" />
                            </label>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Compression level</span>
                            <span className="settings-row-desc">Trade off quality and file size for inline screenshots.</span>
                        </div>
                        <div className="settings-row-right">
                            <select
                                className="settings-input"
                                value={imageUploadCompressionLevel}
                                disabled={!imageUploadCompressionEnabled}
                                onChange={(event) => setImageUploadCompressionLevel(event.target.value as ImageUploadCompressionLevel)}
                            >
                                {imageCompressionLevels.map((option) => (
                                    <option key={option} value={option}>{formatCompressionLevel(option)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Target upload size</span>
                            <span className="settings-row-desc">Optional soft cap for compressed image payloads.</span>
                        </div>
                        <div className="settings-row-right">
                            <select
                                className="settings-input"
                                value={imageUploadCompressionTargetSize}
                                disabled={!imageUploadCompressionEnabled}
                                onChange={(event) => setImageUploadCompressionTargetSize(event.target.value as ImageUploadCompressionTargetSize)}
                            >
                                {imageCompressionTargetSizes.map((option) => (
                                    <option key={option} value={option}>{formatCompressionTarget(option)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">About</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-left">
                            <span className="settings-row-title">Protocol version</span>
                            <span className="settings-row-desc">Web client compatibility version used by hub and runner.</span>
                        </div>
                        <div className="settings-row-right">
                            <span className="settings-badge">{PROTOCOL_VERSION}</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
