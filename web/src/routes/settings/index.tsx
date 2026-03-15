import { useState, useRef, useEffect, useMemo, useCallback, useId, type ChangeEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation, type Locale } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { getElevenLabsSupportedLanguages, getLanguageDisplayName, type Language } from '@/lib/languages'
import { getFontScaleOptions, useFontScale, type FontScale } from '@/hooks/useFontScale'
import { useArchiveConfirmation } from '@/hooks/useArchiveConfirmation'
import { useQueueInlinePanel, type QueueInlinePanelMode } from '@/hooks/useQueueInlinePanel'
import { useCodexSendModePreference } from '@/hooks/useCodexSendModePreference'
import { useProjectQuickCreate } from '@/hooks/useProjectQuickCreate'
import {
    BRIEF_CARD_MAX_LINES_LIMIT,
    BRIEF_CARD_MIN_LINES_LIMIT,
    useBriefModeCardSettings
} from '@/hooks/useBriefModeCardSettings'
import {
    useImageUploadCompression,
    type ImageUploadCompressionLevel,
    type ImageUploadCompressionTargetSize
} from '@/hooks/useImageUploadCompression'
import { useThemePreference, type ThemePreference } from '@/hooks/useTheme'
import { useAppContext } from '@/lib/app-context'
import { useMemory } from '@/hooks/queries/useMemory'
import { queryKeys } from '@/lib/query-keys'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import { Switch } from '@/components/ui/Switch'

const locales: { value: Locale; nativeLabel: string }[] = [
    { value: 'en', nativeLabel: 'English' },
    { value: 'zh-CN', nativeLabel: '简体中文' },
]

const voiceLanguages = getElevenLabsSupportedLanguages()
const themePreferences: ThemePreference[] = ['light', 'dark', 'system']
const queueInlinePanelModes: QueueInlinePanelMode[] = ['off', 'compact', 'full']
const codexSendModes = ['direct', 'queue'] as const
const imageUploadCompressionLevels: ImageUploadCompressionLevel[] = ['light', 'balanced', 'aggressive']
const imageUploadCompressionTargetSizes: ImageUploadCompressionTargetSize[] = ['auto', '500kb', '1mb', '2mb', '5mb']
const SETTINGS_GROUP_EXPANDED_STORAGE_KEY = 'hapi-settings-group-expanded-v1'

type SettingsGroupExpandedState = {
    general: boolean
    interaction: boolean
    dataDiagnostics: boolean
    about: boolean
}

function getDefaultSettingsGroupExpandedState(): SettingsGroupExpandedState {
    return {
        general: true,
        interaction: true,
        dataDiagnostics: false,
        about: false
    }
}

function readSettingsGroupExpandedState(): SettingsGroupExpandedState {
    if (typeof window === 'undefined') {
        return getDefaultSettingsGroupExpandedState()
    }
    const defaults = getDefaultSettingsGroupExpandedState()
    try {
        const rawValue = window.localStorage.getItem(SETTINGS_GROUP_EXPANDED_STORAGE_KEY)
        if (!rawValue) {
            return defaults
        }
        const parsed = JSON.parse(rawValue)
        if (!parsed || typeof parsed !== 'object') {
            return defaults
        }
        return {
            general: typeof parsed.general === 'boolean' ? parsed.general : defaults.general,
            interaction: typeof parsed.interaction === 'boolean' ? parsed.interaction : defaults.interaction,
            dataDiagnostics: typeof parsed.dataDiagnostics === 'boolean' ? parsed.dataDiagnostics : defaults.dataDiagnostics,
            about: typeof parsed.about === 'boolean' ? parsed.about : defaults.about
        }
    } catch {
        return defaults
    }
}

function persistSettingsGroupExpandedState(state: SettingsGroupExpandedState) {
    if (typeof window === 'undefined') {
        return
    }
    window.localStorage.setItem(SETTINGS_GROUP_EXPANDED_STORAGE_KEY, JSON.stringify(state))
}

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function CheckIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

type SettingsSectionProps = {
    title: string
    description: string
    isExpanded: boolean
    onToggle: () => void
    children: ReactNode
}

function SettingsSection(props: SettingsSectionProps) {
    const sectionContentId = useId()
    return (
        <section className="border-b border-[var(--app-divider)]">
            <button
                type="button"
                onClick={props.onToggle}
                className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                aria-expanded={props.isExpanded}
                aria-controls={sectionContentId}
            >
                <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-[var(--app-fg)]">{props.title}</span>
                    <span className="text-xs text-[var(--app-hint)]">{props.description}</span>
                </div>
                <ChevronDownIcon
                    className={`mt-0.5 shrink-0 text-[var(--app-hint)] transition-transform ${
                        props.isExpanded ? 'rotate-180' : ''
                    }`}
                />
            </button>
            {props.isExpanded && (
                <div id={sectionContentId}>
                    {props.children}
                </div>
            )}
        </section>
    )
}

export default function SettingsPage() {
    const { t, locale, setLocale } = useTranslation()
    const { api } = useAppContext()
    const queryClient = useQueryClient()
    const goBack = useAppGoBack()
    const [isOpen, setIsOpen] = useState(false)
    const [isThemeOpen, setIsThemeOpen] = useState(false)
    const [isFontOpen, setIsFontOpen] = useState(false)
    const [isVoiceOpen, setIsVoiceOpen] = useState(false)
    const [isQueuePanelOpen, setIsQueuePanelOpen] = useState(false)
    const [isSendModeOpen, setIsSendModeOpen] = useState(false)
    const [isImageCompressionLevelOpen, setIsImageCompressionLevelOpen] = useState(false)
    const [isImageCompressionTargetSizeOpen, setIsImageCompressionTargetSizeOpen] = useState(false)
    const [groupExpandedState, setGroupExpandedState] = useState<SettingsGroupExpandedState>(() => readSettingsGroupExpandedState())
    const isGeneralGroupExpanded = groupExpandedState.general
    const isInteractionGroupExpanded = groupExpandedState.interaction
    const isDataDiagnosticsGroupExpanded = groupExpandedState.dataDiagnostics
    const isAboutGroupExpanded = groupExpandedState.about
    const containerRef = useRef<HTMLDivElement>(null)
    const themeContainerRef = useRef<HTMLDivElement>(null)
    const fontContainerRef = useRef<HTMLDivElement>(null)
    const voiceContainerRef = useRef<HTMLDivElement>(null)
    const queuePanelContainerRef = useRef<HTMLDivElement>(null)
    const sendModeContainerRef = useRef<HTMLDivElement>(null)
    const imageCompressionLevelContainerRef = useRef<HTMLDivElement>(null)
    const imageCompressionTargetSizeContainerRef = useRef<HTMLDivElement>(null)
    const { fontScale, setFontScale } = useFontScale()
    const { themePreference, setThemePreference } = useThemePreference()
    const { queueInlinePanelMode, setQueueInlinePanelMode } = useQueueInlinePanel()
    const { codexSendModeDefault, setCodexSendModeDefault } = useCodexSendModePreference()
    const {
        briefCardAdaptiveHeight,
        briefCardMaxLines,
        briefCardShowLastBlockFullContent,
        setBriefCardAdaptiveHeight,
        setBriefCardMaxLines,
        setBriefCardShowLastBlockFullContent
    } = useBriefModeCardSettings()
    const {
        imageUploadCompressionEnabled,
        imageUploadCompressionLevel,
        imageUploadCompressionTargetSize,
        setImageUploadCompressionEnabled,
        setImageUploadCompressionLevel,
        setImageUploadCompressionTargetSize
    } = useImageUploadCompression()

    // Voice language state - read from localStorage
    const [voiceLanguage, setVoiceLanguage] = useState<string | null>(() => {
        if (typeof window === 'undefined') {
            return null
        }
        return window.localStorage.getItem('hapi-voice-lang')
    })
    const [usageLoading, setUsageLoading] = useState(false)
    const [usageError, setUsageError] = useState<string | null>(null)
    const [usageOverview, setUsageOverview] = useState<Awaited<ReturnType<typeof api.getUsageOverview>>['overview'] | null>(null)
    const { memory, isLoading: memoryLoading, error: memoryError, refetch: refetchMemory } = useMemory(api)
    const [memoryDraft, setMemoryDraft] = useState('')
    const [memorySavedContent, setMemorySavedContent] = useState('')
    const [memoryStatusMessage, setMemoryStatusMessage] = useState<string | null>(null)
    const [experimentalClaudeLoginShellEnabled, setExperimentalClaudeLoginShellEnabled] = useState(false)
    const [experimentalSettingsLoading, setExperimentalSettingsLoading] = useState(false)
    const [experimentalStatusMessage, setExperimentalStatusMessage] = useState<string | null>(null)
    const isMemoryDirty = memoryDraft !== memorySavedContent
    const [reportDomainDraft, setReportDomainDraft] = useState('')
    const [reportDomainSaved, setReportDomainSaved] = useState('')
    const [reportDomainSource, setReportDomainSource] = useState<'env' | 'file' | 'default'>('default')
    const [reportDomainEnvOverride, setReportDomainEnvOverride] = useState(false)
    const [reportDomainLoading, setReportDomainLoading] = useState(false)
    const [reportDomainStatusMessage, setReportDomainStatusMessage] = useState<string | null>(null)
    const isReportDomainDirty = reportDomainDraft.trim() !== reportDomainSaved.trim()
    const memoryInjectionEnabled = memory?.enabled ?? false
    const pureContextModeEnabled = memory?.pureContextMode ?? false

    const fontScaleOptions = getFontScaleOptions()
    const currentLocale = locales.find((loc) => loc.value === locale)
    const currentThemeLabel = t(`settings.display.theme.${themePreference}`)
    const currentFontScaleLabel = fontScaleOptions.find((opt) => opt.value === fontScale)?.label ?? '100%'
    const currentVoiceLanguage = voiceLanguages.find((lang) => lang.code === voiceLanguage)
    const currentQueuePanelLabel = t(`settings.behavior.queueInlinePanel.${queueInlinePanelMode}`)
    const currentCodexSendModeLabel = t(`queue.mode.${codexSendModeDefault}`)
    const currentQueuePanelModeDescription = t(`settings.behavior.queueInlinePanel.${queueInlinePanelMode}.description`)
    const currentImageCompressionLevelLabel = t(
        `settings.behavior.imageCompression.level.${imageUploadCompressionLevel}`
    )
    const currentImageCompressionTargetSizeLabel = t(
        `settings.behavior.imageCompression.targetSize.${imageUploadCompressionTargetSize}`
    )
    const { skipArchiveConfirmation, setSkipArchiveConfirmation } = useArchiveConfirmation()
    const { projectQuickCreateEnabled, setProjectQuickCreateEnabled } = useProjectQuickCreate()
    const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale])
    const currencyFormatter = useMemo(() => new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2
    }), [locale])

    const formatNumber = useCallback((value: number): string => {
        return numberFormatter.format(value)
    }, [numberFormatter])

    const formatDateTime = useCallback((value: number): string => {
        return new Date(value).toLocaleString(locale)
    }, [locale])

    const formatUsd = useCallback((value: number): string => {
        return currencyFormatter.format(value)
    }, [currencyFormatter])

    const loadUsageOverview = useCallback(async (forceRefresh = false) => {
        setUsageLoading(true)
        setUsageError(null)
        try {
            const result = await api.getUsageOverview({ refresh: forceRefresh })
            if (!result.success || !result.overview) {
                setUsageOverview(null)
                setUsageError(result.error ?? t('settings.usage.loadError'))
                return
            }
            setUsageOverview(result.overview)
        } catch (error) {
            setUsageOverview(null)
            setUsageError(error instanceof Error ? error.message : t('settings.usage.loadError'))
        } finally {
            setUsageLoading(false)
        }
    }, [api, t])

    const loadReportDomainSettings = useCallback(async () => {
        setReportDomainLoading(true)
        setReportDomainStatusMessage(null)
        try {
            const result = await api.getReportDomainSettings()
            setReportDomainDraft(result.settings.value)
            setReportDomainSaved(result.settings.value)
            setReportDomainSource(result.settings.source)
            setReportDomainEnvOverride(result.settings.envOverride)
        } catch (error) {
            setReportDomainStatusMessage(
                error instanceof Error ? error.message : t('settings.reportDomain.status.loadFailed')
            )
        } finally {
            setReportDomainLoading(false)
        }
    }, [api, t])

    const loadExperimentalSettings = useCallback(async () => {
        setExperimentalSettingsLoading(true)
        setExperimentalStatusMessage(null)
        try {
            const result = await api.getExperimentalSettings()
            setExperimentalClaudeLoginShellEnabled(result.settings.claudeLoginShell)
        } catch (error) {
            setExperimentalStatusMessage(
                error instanceof Error ? error.message : t('settings.experimental.status.loadFailed')
            )
        } finally {
            setExperimentalSettingsLoading(false)
        }
    }, [api, t])

    useEffect(() => {
        void loadUsageOverview(false)
    }, [loadUsageOverview])

    useEffect(() => {
        void loadReportDomainSettings()
    }, [loadReportDomainSettings])

    useEffect(() => {
        void loadExperimentalSettings()
    }, [loadExperimentalSettings])

    useEffect(() => {
        if (!memory) {
            return
        }
        if (!isMemoryDirty) {
            setMemoryDraft(memory.content)
            setMemorySavedContent(memory.content)
        }
    }, [memory, isMemoryDirty])

    useEffect(() => {
        persistSettingsGroupExpandedState(groupExpandedState)
    }, [groupExpandedState])

    const saveMemoryMutation = useMutation({
        mutationFn: async (content: string) => {
            return await api.updateMemory({ content, updatedBy: 'user:web:settings' })
        },
        onSuccess: async (result) => {
            setMemorySavedContent(result.memory.content)
            setMemoryDraft(result.memory.content)
            setMemoryStatusMessage(t('settings.memory.status.saved'))
            await queryClient.invalidateQueries({ queryKey: queryKeys.memory })
        },
        onError: (error) => {
            setMemoryStatusMessage(error instanceof Error ? error.message : t('settings.memory.status.saveFailed'))
        }
    })

    const saveReportDomainMutation = useMutation({
        mutationFn: async (domain: string) => {
            return await api.updateReportDomainSettings({
                domain: domain.trim().length > 0 ? domain.trim() : null
            })
        },
        onSuccess: (result) => {
            setReportDomainDraft(result.settings.value)
            setReportDomainSaved(result.settings.value)
            setReportDomainSource(result.settings.source)
            setReportDomainEnvOverride(result.settings.envOverride)
            setReportDomainStatusMessage(t('settings.reportDomain.status.saved'))
        },
        onError: (error) => {
            setReportDomainStatusMessage(
                error instanceof Error ? error.message : t('settings.reportDomain.status.saveFailed')
            )
        }
    })

    const toggleMemoryInjectionMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            return await api.updateMemory({ enabled, updatedBy: 'user:web:settings' })
        },
        onSuccess: async (_result, enabled) => {
            setMemoryStatusMessage(
                enabled
                    ? t('settings.memory.status.injectionEnabled')
                    : t('settings.memory.status.injectionDisabled')
            )
            await queryClient.invalidateQueries({ queryKey: queryKeys.memory })
        },
        onError: (error) => {
            setMemoryStatusMessage(error instanceof Error ? error.message : t('settings.memory.status.toggleFailed'))
        }
    })

    const togglePureContextModeMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            return await api.updateMemory({ pureContextMode: enabled, updatedBy: 'user:web:settings' })
        },
        onSuccess: async (_result, enabled) => {
            setMemoryStatusMessage(
                enabled
                    ? t('settings.memory.status.pureContextModeEnabled')
                    : t('settings.memory.status.pureContextModeDisabled')
            )
            await queryClient.invalidateQueries({ queryKey: queryKeys.memory })
        },
        onError: (error) => {
            setMemoryStatusMessage(error instanceof Error ? error.message : t('settings.memory.status.toggleFailed'))
        }
    })

    const toggleExperimentalClaudeLoginShellMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            return await api.updateExperimentalSettings({ claudeLoginShell: enabled })
        },
        onSuccess: (result, enabled) => {
            setExperimentalClaudeLoginShellEnabled(result.settings.claudeLoginShell)
            setExperimentalStatusMessage(
                enabled
                    ? t('settings.experimental.status.claudeLoginShellEnabled')
                    : t('settings.experimental.status.claudeLoginShellDisabled')
            )
        },
        onError: (error) => {
            setExperimentalStatusMessage(
                error instanceof Error ? error.message : t('settings.experimental.status.saveFailed')
            )
        }
    })

    const handleLocaleChange = (newLocale: Locale) => {
        setLocale(newLocale)
        setIsOpen(false)
    }

    const handleFontScaleChange = (newScale: FontScale) => {
        setFontScale(newScale)
        setIsFontOpen(false)
    }

    const handleThemePreferenceChange = (newPreference: ThemePreference) => {
        setThemePreference(newPreference)
        setIsThemeOpen(false)
    }

    const handleSkipArchiveConfirmToggle = (value: boolean) => {
        setSkipArchiveConfirmation(value)
    }

    const handleQueuePanelModeChange = (mode: QueueInlinePanelMode) => {
        setQueueInlinePanelMode(mode)
        setIsQueuePanelOpen(false)
    }

    const handleCodexSendModeDefaultChange = (mode: typeof codexSendModes[number]) => {
        setCodexSendModeDefault(mode)
        setIsSendModeOpen(false)
    }

    const handleProjectQuickCreateToggle = (value: boolean) => {
        setProjectQuickCreateEnabled(value)
    }

    const handleBriefCardAdaptiveHeightToggle = (value: boolean) => {
        setBriefCardAdaptiveHeight(value)
    }

    const handleBriefCardMaxLinesChange = (event: ChangeEvent<HTMLInputElement>) => {
        const parsed = Number.parseInt(event.target.value, 10)
        setBriefCardMaxLines(parsed)
    }

    const handleBriefCardShowLastBlockFullContentToggle = (value: boolean) => {
        setBriefCardShowLastBlockFullContent(value)
    }

    const handleImageUploadCompressionToggle = (value: boolean) => {
        setImageUploadCompressionEnabled(value)
        if (!value) {
            setIsImageCompressionLevelOpen(false)
            setIsImageCompressionTargetSizeOpen(false)
        }
    }

    const handleImageUploadCompressionLevelChange = (level: ImageUploadCompressionLevel) => {
        setImageUploadCompressionLevel(level)
        setIsImageCompressionLevelOpen(false)
    }

    const handleImageUploadCompressionTargetSizeChange = (targetSize: ImageUploadCompressionTargetSize) => {
        setImageUploadCompressionTargetSize(targetSize)
        setIsImageCompressionTargetSizeOpen(false)
    }

    const handleVoiceLanguageChange = (language: Language) => {
        setVoiceLanguage(language.code)
        if (typeof window === 'undefined') {
            setIsVoiceOpen(false)
            return
        }
        if (language.code === null) {
            window.localStorage.removeItem('hapi-voice-lang')
        } else {
            window.localStorage.setItem('hapi-voice-lang', language.code)
        }
        setIsVoiceOpen(false)
    }

    const handleGeneralGroupToggle = () => {
        setGroupExpandedState((previousState) => {
            const nextGeneralExpanded = !previousState.general
            if (!nextGeneralExpanded) {
                setIsOpen(false)
                setIsThemeOpen(false)
                setIsFontOpen(false)
                setIsVoiceOpen(false)
            }
            return {
                ...previousState,
                general: nextGeneralExpanded
            }
        })
    }

    const handleInteractionGroupToggle = () => {
        setGroupExpandedState((previousState) => {
            const nextInteractionExpanded = !previousState.interaction
            if (!nextInteractionExpanded) {
                setIsQueuePanelOpen(false)
                setIsSendModeOpen(false)
                setIsImageCompressionLevelOpen(false)
                setIsImageCompressionTargetSizeOpen(false)
            }
            return {
                ...previousState,
                interaction: nextInteractionExpanded
            }
        })
    }

    const handleDataDiagnosticsGroupToggle = () => {
        setGroupExpandedState((previousState) => ({
            ...previousState,
            dataDiagnostics: !previousState.dataDiagnostics
        }))
    }

    const handleAboutGroupToggle = () => {
        setGroupExpandedState((previousState) => ({
            ...previousState,
            about: !previousState.about
        }))
    }

    const handleReloadMemory = async () => {
        if (isMemoryDirty) {
            const confirmed = window.confirm(t('settings.memory.confirmReload'))
            if (!confirmed) {
                return
            }
        }
        const result = await refetchMemory()
        const nextMemory = result.data?.memory
        if (nextMemory) {
            setMemoryDraft(nextMemory.content)
            setMemorySavedContent(nextMemory.content)
        }
        setMemoryStatusMessage(t('settings.memory.status.reloaded'))
    }

    const handleSaveMemory = async () => {
        setMemoryStatusMessage(null)
        await saveMemoryMutation.mutateAsync(memoryDraft)
    }

    const handleMemoryInjectionToggle = async (value: boolean) => {
        setMemoryStatusMessage(null)
        await toggleMemoryInjectionMutation.mutateAsync(value)
    }

    const handlePureContextModeToggle = async (value: boolean) => {
        setMemoryStatusMessage(null)
        await togglePureContextModeMutation.mutateAsync(value)
    }

    const handleReloadReportDomain = async () => {
        await loadReportDomainSettings()
        setReportDomainStatusMessage(t('settings.reportDomain.status.reloaded'))
    }

    const handleSaveReportDomain = async () => {
        setReportDomainStatusMessage(null)
        await saveReportDomainMutation.mutateAsync(reportDomainDraft)
    }

    // Close dropdown when clicking outside
    useEffect(() => {
        if (
            !isOpen &&
            !isThemeOpen &&
            !isFontOpen &&
            !isVoiceOpen &&
            !isQueuePanelOpen &&
            !isSendModeOpen &&
            !isImageCompressionLevelOpen &&
            !isImageCompressionTargetSizeOpen
        ) return

        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
            if (isThemeOpen && themeContainerRef.current && !themeContainerRef.current.contains(event.target as Node)) {
                setIsThemeOpen(false)
            }
            if (isFontOpen && fontContainerRef.current && !fontContainerRef.current.contains(event.target as Node)) {
                setIsFontOpen(false)
            }
            if (isVoiceOpen && voiceContainerRef.current && !voiceContainerRef.current.contains(event.target as Node)) {
                setIsVoiceOpen(false)
            }
            if (isQueuePanelOpen && queuePanelContainerRef.current && !queuePanelContainerRef.current.contains(event.target as Node)) {
                setIsQueuePanelOpen(false)
            }
            if (isSendModeOpen && sendModeContainerRef.current && !sendModeContainerRef.current.contains(event.target as Node)) {
                setIsSendModeOpen(false)
            }
            if (
                isImageCompressionLevelOpen &&
                imageCompressionLevelContainerRef.current &&
                !imageCompressionLevelContainerRef.current.contains(event.target as Node)
            ) {
                setIsImageCompressionLevelOpen(false)
            }
            if (
                isImageCompressionTargetSizeOpen &&
                imageCompressionTargetSizeContainerRef.current &&
                !imageCompressionTargetSizeContainerRef.current.contains(event.target as Node)
            ) {
                setIsImageCompressionTargetSizeOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [
        isOpen,
        isThemeOpen,
        isFontOpen,
        isVoiceOpen,
        isQueuePanelOpen,
        isSendModeOpen,
        isImageCompressionLevelOpen,
        isImageCompressionTargetSizeOpen
    ])

    // Close on escape key
    useEffect(() => {
        if (
            !isOpen &&
            !isThemeOpen &&
            !isFontOpen &&
            !isVoiceOpen &&
            !isQueuePanelOpen &&
            !isSendModeOpen &&
            !isImageCompressionLevelOpen &&
            !isImageCompressionTargetSizeOpen
        ) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
                setIsThemeOpen(false)
                setIsFontOpen(false)
                setIsVoiceOpen(false)
                setIsQueuePanelOpen(false)
                setIsSendModeOpen(false)
                setIsImageCompressionLevelOpen(false)
                setIsImageCompressionTargetSizeOpen(false)
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [
        isOpen,
        isThemeOpen,
        isFontOpen,
        isVoiceOpen,
        isQueuePanelOpen,
        isSendModeOpen,
        isImageCompressionLevelOpen,
        isImageCompressionTargetSizeOpen
    ])

    return (
        <div className="flex h-full flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="flex-1 font-semibold">{t('settings.title')}</div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-content">
                    <SettingsSection
                        title={t('settings.group.general.title')}
                        description={t('settings.group.general.description')}
                        isExpanded={isGeneralGroupExpanded}
                        onToggle={handleGeneralGroupToggle}
                    >
                    {/* Language section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.language.title')}
                        </div>
                        <div ref={containerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsOpen(!isOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.language.label')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentLocale?.nativeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.language.title')}
                                >
                                    {locales.map((loc) => {
                                        const isSelected = locale === loc.value
                                        return (
                                            <button
                                                key={loc.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleLocaleChange(loc.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{loc.nativeLabel}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Display section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.display.title')}
                        </div>
                        <div ref={themeContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsThemeOpen(!isThemeOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isThemeOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.theme')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentThemeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isThemeOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isThemeOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[140px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.theme')}
                                >
                                    {themePreferences.map((preference) => {
                                        const isSelected = themePreference === preference
                                        return (
                                            <button
                                                key={preference}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleThemePreferenceChange(preference)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(`settings.display.theme.${preference}`)}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div ref={fontContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsFontOpen(!isFontOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isFontOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.fontSize')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentFontScaleLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isFontOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isFontOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[140px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.fontSize')}
                                >
                                    {fontScaleOptions.map((opt) => {
                                        const isSelected = fontScale === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleFontScaleChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Voice Assistant section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.voice.title')}
                        </div>
                        <div ref={voiceContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsVoiceOpen(!isVoiceOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isVoiceOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.voice.language')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>
                                        {currentVoiceLanguage
                                            ? currentVoiceLanguage.code === null
                                                ? t('settings.voice.autoDetect')
                                                : getLanguageDisplayName(currentVoiceLanguage)
                                            : t('settings.voice.autoDetect')}
                                    </span>
                                    <ChevronDownIcon className={`transition-transform ${isVoiceOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isVoiceOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[200px] max-h-[300px] overflow-y-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg z-50"
                                    role="listbox"
                                    aria-label={t('settings.voice.title')}
                                >
                                    {voiceLanguages.map((lang) => {
                                        const isSelected = voiceLanguage === lang.code
                                        const displayName = lang.code === null
                                            ? t('settings.voice.autoDetect')
                                            : getLanguageDisplayName(lang)
                                        return (
                                            <button
                                                key={lang.code ?? 'auto'}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleVoiceLanguageChange(lang)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{displayName}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    </SettingsSection>

                    <SettingsSection
                        title={t('settings.group.interaction.title')}
                        description={t('settings.group.interaction.description')}
                        isExpanded={isInteractionGroupExpanded}
                        onToggle={handleInteractionGroupToggle}
                    >
                    {/* Behavior section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.behavior.title')}
                        </div>
                        <div ref={sendModeContainerRef} className="relative border-b border-[var(--app-border)]">
                            <button
                                type="button"
                                onClick={() => setIsSendModeOpen(!isSendModeOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isSendModeOpen}
                                aria-haspopup="listbox"
                            >
                                <div className="flex flex-col">
                                    <span className="text-[var(--app-fg)]">
                                        {t('settings.behavior.defaultSendMode')}
                                    </span>
                                    <span className="text-xs text-[var(--app-hint)]">
                                        {t('settings.behavior.defaultSendMode.description')}
                                    </span>
                                </div>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentCodexSendModeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isSendModeOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isSendModeOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[220px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden divide-y divide-[var(--app-divider)] z-50"
                                    role="listbox"
                                    aria-label={t('settings.behavior.defaultSendMode')}
                                >
                                    {codexSendModes.map((mode) => {
                                        const isSelected = codexSendModeDefault === mode
                                        return (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleCodexSendModeDefaultChange(mode)}
                                                className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span className="flex min-w-0 flex-col">
                                                    <span>{t(`queue.mode.${mode}`)}</span>
                                                    <span
                                                        className={`text-xs ${
                                                            isSelected ? 'text-[var(--app-link)] opacity-80' : 'text-[var(--app-hint)]'
                                                        }`}
                                                    >
                                                        {t(`queue.mode.${mode}Hint`)}
                                                    </span>
                                                </span>
                                                {isSelected && (
                                                    <span className="mt-0.5 shrink-0 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <div ref={queuePanelContainerRef} className="relative border-b border-[var(--app-border)]">
                            <button
                                type="button"
                                onClick={() => setIsQueuePanelOpen(!isQueuePanelOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isQueuePanelOpen}
                                aria-haspopup="listbox"
                            >
                                <div className="flex flex-col">
                                    <span className="text-[var(--app-fg)]">
                                        {t('settings.behavior.queueInlinePanel')}
                                    </span>
                                    <span className="text-xs text-[var(--app-hint)]">
                                        {t('settings.behavior.queueInlinePanel.description')} · {currentQueuePanelModeDescription}
                                    </span>
                                </div>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentQueuePanelLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isQueuePanelOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isQueuePanelOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[220px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden divide-y divide-[var(--app-divider)] z-50"
                                    role="listbox"
                                    aria-label={t('settings.behavior.queueInlinePanel')}
                                >
                                    {queueInlinePanelModes.map((mode) => {
                                        const isSelected = queueInlinePanelMode === mode
                                        return (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleQueuePanelModeChange(mode)}
                                                className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span className="flex min-w-0 flex-col">
                                                    <span>{t(`settings.behavior.queueInlinePanel.${mode}`)}</span>
                                                    <span
                                                        className={`text-xs ${
                                                            isSelected ? 'text-[var(--app-link)] opacity-80' : 'text-[var(--app-hint)]'
                                                        }`}
                                                    >
                                                        {t(`settings.behavior.queueInlinePanel.${mode}.description`)}
                                                    </span>
                                                </span>
                                                {isSelected && (
                                                    <span className="mt-0.5 shrink-0 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="flex items-start justify-between gap-3 px-3 py-3 border-b border-[var(--app-divider)]">
                            <div className="flex flex-col">
                                <span className="text-[var(--app-fg)]">
                                    {t('settings.behavior.projectQuickCreate')}
                                </span>
                                <span className="text-xs text-[var(--app-hint)]">
                                    {t('settings.behavior.projectQuickCreate.description')}
                                </span>
                            </div>
                            <Switch
                                checked={projectQuickCreateEnabled}
                                onCheckedChange={handleProjectQuickCreateToggle}
                                ariaLabel={t('settings.behavior.projectQuickCreate')}
                            />
                        </div>
                        <div className="flex items-start justify-between gap-3 px-3 py-3 border-b border-[var(--app-divider)]">
                            <div className="flex flex-col">
                                <span className="text-[var(--app-fg)]">
                                    {t('settings.behavior.briefCardAdaptive')}
                                </span>
                                <span className="text-xs text-[var(--app-hint)]">
                                    {t('settings.behavior.briefCardAdaptive.description')}
                                </span>
                            </div>
                            <Switch
                                checked={briefCardAdaptiveHeight}
                                onCheckedChange={handleBriefCardAdaptiveHeightToggle}
                                ariaLabel={t('settings.behavior.briefCardAdaptive')}
                            />
                        </div>
                        <div className="border-b border-[var(--app-divider)] px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex flex-col">
                                    <span className="text-[var(--app-fg)]">
                                        {t('settings.behavior.briefCardMaxLines')}
                                    </span>
                                    <span className="text-xs text-[var(--app-hint)]">
                                        {t('settings.behavior.briefCardMaxLines.description')}
                                    </span>
                                </div>
                                <span className="text-sm text-[var(--app-hint)]">
                                    {t('settings.behavior.briefCardMaxLines.value', {
                                        value: briefCardMaxLines,
                                        max: BRIEF_CARD_MAX_LINES_LIMIT
                                    })}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={BRIEF_CARD_MIN_LINES_LIMIT}
                                max={BRIEF_CARD_MAX_LINES_LIMIT}
                                step={1}
                                value={briefCardMaxLines}
                                onChange={handleBriefCardMaxLinesChange}
                                aria-label={t('settings.behavior.briefCardMaxLines')}
                                className="mt-3 w-full accent-[var(--app-link)]"
                            />
                        </div>
                        <div className="flex items-start justify-between gap-3 px-3 py-3 border-b border-[var(--app-divider)]">
                            <div className="flex flex-col">
                                <span className="text-[var(--app-fg)]">
                                    {t('settings.behavior.briefCardShowLastBlockFullContent')}
                                </span>
                                <span className="text-xs text-[var(--app-hint)]">
                                    {t('settings.behavior.briefCardShowLastBlockFullContent.description')}
                                </span>
                            </div>
                            <Switch
                                checked={briefCardShowLastBlockFullContent}
                                onCheckedChange={handleBriefCardShowLastBlockFullContentToggle}
                                ariaLabel={t('settings.behavior.briefCardShowLastBlockFullContent')}
                            />
                        </div>
                        <div className="flex items-start justify-between gap-3 px-3 py-3 border-b border-[var(--app-divider)]">
                            <div className="flex flex-col">
                                <span className="text-[var(--app-fg)]">
                                    {t('settings.behavior.imageCompression')}
                                </span>
                                <span className="text-xs text-[var(--app-hint)]">
                                    {t('settings.behavior.imageCompression.description')}
                                </span>
                            </div>
                            <Switch
                                checked={imageUploadCompressionEnabled}
                                onCheckedChange={handleImageUploadCompressionToggle}
                                ariaLabel={t('settings.behavior.imageCompression')}
                            />
                        </div>
                        <div ref={imageCompressionLevelContainerRef} className="relative border-b border-[var(--app-divider)]">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!imageUploadCompressionEnabled) {
                                        return
                                    }
                                    setIsImageCompressionLevelOpen(!isImageCompressionLevelOpen)
                                }}
                                disabled={!imageUploadCompressionEnabled}
                                className={`flex w-full items-center justify-between px-3 py-3 text-left transition-colors ${
                                    imageUploadCompressionEnabled
                                        ? 'hover:bg-[var(--app-subtle-bg)]'
                                        : 'cursor-not-allowed opacity-60'
                                }`}
                                aria-expanded={isImageCompressionLevelOpen}
                                aria-haspopup="listbox"
                            >
                                <div className="flex flex-col">
                                    <span className="text-[var(--app-fg)]">
                                        {t('settings.behavior.imageCompression.level')}
                                    </span>
                                    <span className="text-xs text-[var(--app-hint)]">
                                        {t('settings.behavior.imageCompression.level.description')}
                                    </span>
                                </div>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentImageCompressionLevelLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isImageCompressionLevelOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isImageCompressionLevelOpen && imageUploadCompressionEnabled && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[220px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.behavior.imageCompression.level')}
                                >
                                    {imageUploadCompressionLevels.map((level) => {
                                        const isSelected = imageUploadCompressionLevel === level
                                        return (
                                            <button
                                                key={level}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleImageUploadCompressionLevelChange(level)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(`settings.behavior.imageCompression.level.${level}`)}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div ref={imageCompressionTargetSizeContainerRef} className="relative border-b border-[var(--app-divider)]">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!imageUploadCompressionEnabled) {
                                        return
                                    }
                                    setIsImageCompressionTargetSizeOpen(!isImageCompressionTargetSizeOpen)
                                }}
                                disabled={!imageUploadCompressionEnabled}
                                className={`flex w-full items-center justify-between px-3 py-3 text-left transition-colors ${
                                    imageUploadCompressionEnabled
                                        ? 'hover:bg-[var(--app-subtle-bg)]'
                                        : 'cursor-not-allowed opacity-60'
                                }`}
                                aria-expanded={isImageCompressionTargetSizeOpen}
                                aria-haspopup="listbox"
                            >
                                <div className="flex flex-col">
                                    <span className="text-[var(--app-fg)]">
                                        {t('settings.behavior.imageCompression.targetSize')}
                                    </span>
                                    <span className="text-xs text-[var(--app-hint)]">
                                        {t('settings.behavior.imageCompression.targetSize.description')}
                                    </span>
                                </div>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentImageCompressionTargetSizeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isImageCompressionTargetSizeOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isImageCompressionTargetSizeOpen && imageUploadCompressionEnabled && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[220px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.behavior.imageCompression.targetSize')}
                                >
                                    {imageUploadCompressionTargetSizes.map((targetSize) => {
                                        const isSelected = imageUploadCompressionTargetSize === targetSize
                                        return (
                                            <button
                                                key={targetSize}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleImageUploadCompressionTargetSizeChange(targetSize)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(`settings.behavior.imageCompression.targetSize.${targetSize}`)}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="border-b border-[var(--app-divider)]">
                            <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                                {t('settings.experimental.title')}
                            </div>
                            <div className="flex items-start justify-between gap-3 px-3 py-3">
                                <div className="flex flex-col">
                                    <span className="text-[var(--app-fg)]">
                                        {t('settings.experimental.claudeLoginShell.title')}
                                    </span>
                                    <span className="text-xs text-[var(--app-hint)]">
                                        {t('settings.experimental.claudeLoginShell.description')}
                                    </span>
                                    {experimentalStatusMessage && (
                                        <span className="mt-1 text-xs text-[var(--app-hint)]">
                                            {experimentalStatusMessage}
                                        </span>
                                    )}
                                </div>
                                <Switch
                                    checked={experimentalClaudeLoginShellEnabled}
                                    onCheckedChange={(enabled) => {
                                        setExperimentalStatusMessage(null)
                                        void toggleExperimentalClaudeLoginShellMutation.mutateAsync(enabled)
                                    }}
                                    disabled={experimentalSettingsLoading || toggleExperimentalClaudeLoginShellMutation.isPending}
                                    ariaLabel={t('settings.experimental.claudeLoginShell.title')}
                                />
                            </div>
                        </div>
                        <div className="flex items-start justify-between gap-3 px-3 py-3">
                            <div className="flex flex-col">
                                <span className="text-[var(--app-fg)]">
                                    {t('settings.behavior.archiveConfirm')}
                                </span>
                                <span className="text-xs text-[var(--app-hint)]">
                                    {t('settings.behavior.archiveConfirm.description')}
                                </span>
                            </div>
                            <Switch
                                checked={skipArchiveConfirmation}
                                onCheckedChange={handleSkipArchiveConfirmToggle}
                                ariaLabel={t('settings.behavior.archiveConfirm')}
                            />
                        </div>
                    </div>
                    </SettingsSection>

                    <SettingsSection
                        title={t('settings.group.dataDiagnostics.title')}
                        description={t('settings.group.dataDiagnostics.description')}
                        isExpanded={isDataDiagnosticsGroupExpanded}
                        onToggle={handleDataDiagnosticsGroupToggle}
                    >
                    {/* Usage section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.usage.title')}
                        </div>
                        <div className="px-3 pb-2 text-xs text-[var(--app-hint)]">
                            {t('settings.usage.description')}
                        </div>
                        <div className="px-3 pb-3">
                            <button
                                type="button"
                                onClick={() => void loadUsageOverview(true)}
                                disabled={usageLoading}
                                className="inline-flex rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {usageLoading ? t('settings.usage.loading') : t('settings.usage.refresh')}
                            </button>
                        </div>

                        {usageError ? (
                            <div className="px-3 pb-3">
                                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                                    {usageError}
                                </div>
                            </div>
                        ) : null}

                        {usageOverview ? (
                            <div className="space-y-2 px-3 pb-3">
                                {([usageOverview.claude, usageOverview.codex] as const).map((provider) => (
                                    <div
                                        key={provider.provider}
                                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-medium text-[var(--app-fg)]">
                                                {t(`settings.usage.provider.${provider.provider}`)}
                                            </div>
                                            <span className="text-xs text-[var(--app-hint)]">
                                                {t('settings.usage.files')}: {formatNumber(provider.filesScanned)}
                                            </span>
                                        </div>

                                        {provider.available ? (
                                            <div className="mt-2 space-y-1 text-sm text-[var(--app-fg)]">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[var(--app-hint)]">{t('settings.usage.allTimeTotalTokens')}</span>
                                                    <span className="font-semibold">{formatNumber(provider.allTime.totalTokens)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[var(--app-hint)]">{t('settings.usage.last30DaysTotalTokens')}</span>
                                                    <span>{formatNumber(provider.last30Days.totalTokens)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[var(--app-hint)]">{t('settings.usage.allTimeEvents')}</span>
                                                    <span>{formatNumber(provider.eventCount)}</span>
                                                </div>
                                                {provider.estimatedCost ? (
                                                    <>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[var(--app-hint)]">{t('settings.usage.allTimeEstimatedCost')}</span>
                                                            <span className="font-semibold">≈{formatUsd(provider.estimatedCost.allTimeUsd)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[var(--app-hint)]">{t('settings.usage.last30DaysEstimatedCost')}</span>
                                                            <span>≈{formatUsd(provider.estimatedCost.last30DaysUsd)}</span>
                                                        </div>
                                                        <div className="text-xs text-[var(--app-hint)]">
                                                            {t('settings.usage.estimateHint')} {formatUsd(provider.estimatedCost.usdPerMillionTokens)}/1M tokens
                                                            {' · '}
                                                            {t(`settings.usage.rateSource.${provider.estimatedCost.rateSource}`)}
                                                            {provider.estimatedCost.pricingModel ? ` · ${provider.estimatedCost.pricingModel}` : ''}
                                                        </div>
                                                    </>
                                                ) : null}
                                                {provider.parseErrors > 0 ? (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[var(--app-hint)]">{t('settings.usage.parseErrors')}</span>
                                                        <span>{formatNumber(provider.parseErrors)}</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="mt-2 text-sm text-[var(--app-hint)]">
                                                {t('settings.usage.unavailable')}
                                            </div>
                                        )}

                                        {provider.roots.length > 0 ? (
                                            <div className="mt-2 break-all text-xs text-[var(--app-hint)]">
                                                {provider.roots.join(', ')}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                                <div className="text-xs text-[var(--app-hint)]">
                                    {t('settings.usage.updatedAt')}: {formatDateTime(usageOverview.generatedAt)}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Report domain section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.reportDomain.title')}
                        </div>
                        <div className="px-3 pb-2 text-xs text-[var(--app-hint)]">
                            {t('settings.reportDomain.description')}
                        </div>
                        <div className="px-3 pb-3">
                            <input
                                value={reportDomainDraft}
                                onChange={(event) => setReportDomainDraft(event.target.value)}
                                placeholder={t('settings.reportDomain.placeholder')}
                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)] disabled:opacity-60"
                                spellCheck={false}
                                disabled={reportDomainLoading || reportDomainEnvOverride}
                            />
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs text-[var(--app-hint)]">
                                    {reportDomainEnvOverride
                                        ? t('settings.reportDomain.status.envLocked')
                                        : isReportDomainDirty
                                            ? t('settings.reportDomain.status.unsaved')
                                            : reportDomainStatusMessage ?? t('settings.reportDomain.status.synced')}
                                    {' · '}
                                    {t(`settings.reportDomain.source.${reportDomainSource}`)}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { void handleReloadReportDomain() }}
                                        disabled={reportDomainLoading || saveReportDomainMutation.isPending}
                                        className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {t('settings.reportDomain.actions.reload')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { void handleSaveReportDomain() }}
                                        disabled={
                                            reportDomainLoading
                                            || reportDomainEnvOverride
                                            || !isReportDomainDirty
                                            || saveReportDomainMutation.isPending
                                        }
                                        className="rounded-md bg-[var(--app-link)] px-2.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {saveReportDomainMutation.isPending
                                            ? t('settings.reportDomain.actions.saving')
                                            : t('settings.reportDomain.actions.save')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Memory section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                                {t('settings.memory.pureContextMode.title')}
                            </div>
                            <Switch
                                checked={pureContextModeEnabled}
                                onCheckedChange={(value) => { void handlePureContextModeToggle(value) }}
                                disabled={memoryLoading || togglePureContextModeMutation.isPending}
                                ariaLabel={t('settings.memory.pureContextMode.title')}
                            />
                        </div>
                        <div className="px-3 pb-2 text-xs text-[var(--app-hint)]">
                            {t('settings.memory.pureContextMode.description')}
                        </div>
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                                {t('settings.memory.injection.title')}
                            </div>
                            <Switch
                                checked={memoryInjectionEnabled}
                                onCheckedChange={(value) => { void handleMemoryInjectionToggle(value) }}
                                disabled={memoryLoading || toggleMemoryInjectionMutation.isPending || pureContextModeEnabled}
                                ariaLabel={t('settings.memory.injection.title')}
                            />
                        </div>
                        <div className="px-3 pb-2 text-xs text-[var(--app-hint)]">
                            {t('settings.memory.description')}
                        </div>
                        <div className="px-3 pb-2 text-xs text-[var(--app-hint)] break-all">
                            {memory?.path ?? t('settings.memory.pathLoading')}
                        </div>

                        {memoryError ? (
                            <div className="px-3 pb-2">
                                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                                    {memoryError}
                                </div>
                            </div>
                        ) : null}

                        <div className="px-3 pb-3">
                            <textarea
                                value={memoryDraft}
                                onChange={(event) => setMemoryDraft(event.target.value)}
                                placeholder={memoryLoading ? t('settings.memory.placeholder.loading') : t('settings.memory.placeholder.edit')}
                                className="h-56 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                                spellCheck={false}
                            />
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-xs text-[var(--app-hint)]">
                                    {isMemoryDirty ? t('settings.memory.status.unsaved') : memoryStatusMessage ?? t('settings.memory.status.synced')}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { void handleReloadMemory() }}
                                        disabled={saveMemoryMutation.isPending}
                                        className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {t('settings.memory.actions.reload')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { void handleSaveMemory() }}
                                        disabled={!isMemoryDirty || saveMemoryMutation.isPending}
                                        className="rounded-md bg-[var(--app-link)] px-2.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {saveMemoryMutation.isPending ? t('settings.memory.actions.saving') : t('settings.memory.actions.save')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    </SettingsSection>

                    <SettingsSection
                        title={t('settings.group.about.title')}
                        description={t('settings.group.about.description')}
                        isExpanded={isAboutGroupExpanded}
                        onToggle={handleAboutGroupToggle}
                    >
                    {/* About section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.website')}</span>
                            <a
                                href="https://hapi.run"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--app-link)] hover:underline"
                            >
                                hapi.run
                            </a>
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.appVersion')}</span>
                            <span className="text-[var(--app-hint)]">{__APP_VERSION__}</span>
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.protocolVersion')}</span>
                            <span className="text-[var(--app-hint)]">{PROTOCOL_VERSION}</span>
                        </div>
                    </div>
                    </SettingsSection>
                </div>
            </div>
        </div>
    )
}
