import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nContext, I18nProvider } from '@/lib/i18n-context'
import { en } from '@/lib/locales'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import SettingsPage from './index'

const getUsageOverviewMock = vi.fn(async () => ({
    success: true,
    overview: {
        generatedAt: Date.now(),
        windowDays: 30,
        claude: {
            provider: 'claude',
            available: false,
            roots: [],
            filesScanned: 0,
            parseErrors: 0,
            eventCount: 0,
            last30DaysEventCount: 0,
            allTime: {
                inputTokens: 0,
                cachedInputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                totalTokens: 0
            },
            last30Days: {
                inputTokens: 0,
                cachedInputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                totalTokens: 0
            }
        },
        codex: {
            provider: 'codex',
            available: false,
            roots: [],
            filesScanned: 0,
            parseErrors: 0,
            eventCount: 0,
            last30DaysEventCount: 0,
            allTime: {
                inputTokens: 0,
                cachedInputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                totalTokens: 0
            },
            last30Days: {
                inputTokens: 0,
                cachedInputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                totalTokens: 0
            }
        }
    }
}))

const getMemoryMock = vi.fn(async () => ({
    memory: {
        path: '/tmp/MEMORY.md',
        content: '# MEMORY.md\n',
        updatedAt: Date.now(),
        bytes: 12
    }
}))

const updateMemoryMock = vi.fn(async (payload: { content: string }) => ({
    memory: {
        path: '/tmp/MEMORY.md',
        content: payload.content,
        updatedAt: Date.now(),
        bytes: payload.content.length
    }
}))

// Mock the router hooks
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
    useRouter: () => ({ history: { back: vi.fn() } }),
    useLocation: () => '/settings',
}))

// Mock useFontScale hook
vi.mock('@/hooks/useFontScale', () => ({
    useFontScale: () => ({ fontScale: 1, setFontScale: vi.fn() }),
    getFontScaleOptions: () => [
        { value: 0.875, label: '87.5%' },
        { value: 1, label: '100%' },
        { value: 1.125, label: '112.5%' },
    ],
}))

vi.mock('@/hooks/useTheme', () => ({
    useThemePreference: () => ({ themePreference: 'system', setThemePreference: vi.fn() }),
}))

// Mock languages
vi.mock('@/lib/languages', () => ({
    getElevenLabsSupportedLanguages: () => [
        { code: null, name: 'Auto-detect' },
        { code: 'en', name: 'English' },
    ],
    getLanguageDisplayName: (lang: { code: string | null; name: string }) => lang.name,
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: {
            getUsageOverview: getUsageOverviewMock,
            getMemory: getMemoryMock,
            updateMemory: updateMemoryMock
        }
    })
}))

function renderWithProviders(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
        }
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                {ui}
            </I18nProvider>
        </QueryClientProvider>
    )
}

function renderWithSpyT(ui: React.ReactElement) {
    const translations = en as Record<string, string>
    const spyT = vi.fn((key: string) => translations[key] ?? key)
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
        }
    })
    render(
        <QueryClientProvider client={queryClient}>
            <I18nContext.Provider value={{ t: spyT, locale: 'en', setLocale: vi.fn() }}>
                {ui}
            </I18nContext.Provider>
        </QueryClientProvider>
    )
    return spyT
}

describe('SettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Mock localStorage
        const localStorageMock = {
            getItem: vi.fn(() => 'en'),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        }
        Object.defineProperty(window, 'localStorage', { value: localStorageMock })
    })

    it('renders the About section', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getByText('About')).toBeInTheDocument()
    })

    it('displays the App Version with correct value', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('App Version').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(__APP_VERSION__).length).toBeGreaterThanOrEqual(1)
    })

    it('displays the Protocol Version with correct value', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('Protocol Version').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(String(PROTOCOL_VERSION)).length).toBeGreaterThanOrEqual(1)
    })

    it('displays the Theme setting', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('Theme').length).toBeGreaterThanOrEqual(1)
    })

    it('displays the website link with correct URL and security attributes', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('Website').length).toBeGreaterThanOrEqual(1)
        const links = screen.getAllByRole('link', { name: 'hapi.run' })
        expect(links.length).toBeGreaterThanOrEqual(1)
        const link = links[0]
        expect(link).toHaveAttribute('href', 'https://hapi.run')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('uses correct i18n keys for About section', () => {
        const spyT = renderWithSpyT(<SettingsPage />)
        const calledKeys = spyT.mock.calls.map((call) => call[0])
        expect(calledKeys).toContain('settings.display.theme')
        expect(calledKeys).toContain('settings.display.theme.system')
        expect(calledKeys).toContain('settings.behavior.imageCompression')
        expect(calledKeys).toContain('settings.behavior.imageCompression.level')
        expect(calledKeys).toContain('settings.behavior.imageCompression.targetSize')
        expect(calledKeys).toContain('settings.about.title')
        expect(calledKeys).toContain('settings.about.website')
        expect(calledKeys).toContain('settings.about.appVersion')
        expect(calledKeys).toContain('settings.about.protocolVersion')
    })
})
