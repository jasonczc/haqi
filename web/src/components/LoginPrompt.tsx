import { useCallback, useEffect, useState } from 'react'
import { ApiClient } from '@/api/client'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'
import type { ServerUrlResult } from '@/hooks/useServerUrl'

type LoginPromptProps = {
    mode?: 'login' | 'bind'
    onLogin?: (token: string) => void
    onBind?: (token: string) => Promise<void>
    baseUrl: string
    serverUrl: string | null
    setServerUrl: (input: string) => ServerUrlResult
    clearServerUrl: () => void
    requireServerUrl?: boolean
    error?: string | null
}

export function LoginPrompt(props: LoginPromptProps) {
    const { t } = useTranslation()
    const isBindMode = props.mode === 'bind'
    const [accessToken, setAccessToken] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)
    const [serverInput, setServerInput] = useState(props.serverUrl ?? '')
    const [serverError, setServerError] = useState<string | null>(null)

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()

        const trimmedToken = accessToken.trim()
        if (!trimmedToken) {
            setError(t('login.error.enterToken'))
            return
        }

        if (!isBindMode && props.requireServerUrl && !props.serverUrl) {
            setServerError(t('login.server.required'))
            setIsServerDialogOpen(true)
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            if (isBindMode) {
                if (!props.onBind) {
                    setError(t('login.error.bindingUnavailable'))
                    return
                }
                await props.onBind(trimmedToken)
            } else {
                // Validate token by attempting to authenticate
                const client = new ApiClient('', { baseUrl: props.baseUrl })
                await client.authenticate({ accessToken: trimmedToken })
                // If successful, pass token to parent
                if (!props.onLogin) {
                    setError(t('login.error.loginUnavailable'))
                    return
                }
                props.onLogin(trimmedToken)
            }
        } catch (e) {
            const fallbackMessage = isBindMode ? t('login.error.bindFailed') : t('login.error.authFailed')
            setError(e instanceof Error ? e.message : fallbackMessage)
        } finally {
            setIsLoading(false)
        }
    }, [accessToken, props, t, isBindMode])

    useEffect(() => {
        if (!isServerDialogOpen) {
            return
        }
        setServerInput(props.serverUrl ?? '')
    }, [isServerDialogOpen, props.serverUrl])

    const handleSaveServer = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        const result = props.setServerUrl(serverInput)
        if (!result.ok) {
            setServerError(result.error)
            return
        }
        setServerError(null)
        setServerInput(result.value)
        setIsServerDialogOpen(false)
    }, [props, serverInput])

    const handleClearServer = useCallback(() => {
        props.clearServerUrl()
        setServerInput('')
        setServerError(null)
        setIsServerDialogOpen(false)
    }, [props])

    const handleServerDialogOpenChange = useCallback((open: boolean) => {
        setIsServerDialogOpen(open)
        if (!open) {
            setServerError(null)
        }
    }, [])

    const displayError = error || props.error
    const serverSummary = props.serverUrl ?? `${props.baseUrl} ${t('login.server.default')}`
    const title = isBindMode ? t('login.bind.title') : t('login.title')
    const subtitle = t('login.subtitle')
    const submitLabel = isBindMode ? t('login.bind.submit') : t('login.submit')

    return (
        <div className="relative h-full flex items-center justify-center p-4">
            {/* Language switcher */}
            <div className="absolute top-4 right-4">
                <LanguageSwitcher />
            </div>

            <div className="w-full max-w-sm space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="text-2xl font-semibold">{title}</div>
                    <div className="text-sm text-[var(--text-tertiary)]">
                        {subtitle}
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="password"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder={t('login.placeholder')}
                            autoComplete="current-password"
                            disabled={isLoading}
                            className="w-full rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-editor)] px-3 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
                        />
                    </div>

                    {displayError && (
                        <div className="text-center text-sm text-[var(--danger)]">
                            {displayError}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || !accessToken.trim()}
                        aria-busy={isLoading}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--bg-neutral)] py-2.5 font-medium text-[var(--bg-editor)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <Spinner size="sm" label={null} className="text-[var(--bg-editor)]" />
                                {isBindMode ? t('login.bind.submitting') : t('login.submitting')}
                            </>
                        ) : (
                            submitLabel
                        )}
                    </button>
                </form>

                {/* Help links */}
                {!isBindMode && (
                    <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                        <a href="https://hapi.run/docs" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">
                            {t('login.help')}
                        </a>
                        <Dialog open={isServerDialogOpen} onOpenChange={handleServerDialogOpenChange}>
                            <DialogTrigger asChild>
                                <button type="button" className="underline hover:text-[var(--text-primary)]">
                                    Hub {props.serverUrl ? `${t('login.server.custom')}` : `${t('login.server.default')}`}
                                </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                                <DialogHeader>
                                    <DialogTitle>{t('login.server.title')}</DialogTitle>
                                    <DialogDescription>
                                        {t('login.server.description')}
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleSaveServer} className="space-y-4">
                                    <div className="text-xs text-[var(--text-tertiary)]">
                                        {t('login.server.current')} {serverSummary}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium">{t('login.server.origin')}</label>
                                        <input
                                            type="url"
                                            value={serverInput}
                                            onChange={(e) => {
                                                setServerInput(e.target.value)
                                                setServerError(null)
                                            }}
                                            placeholder={t('login.server.placeholder')}
                                            className="w-full rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-editor)] px-3 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                        />
                                        <div className="text-[11px] text-[var(--text-tertiary)]">
                                            {t('login.server.hint')}
                                        </div>
                                    </div>

                                    {serverError && (
                                        <div className="text-sm text-[var(--danger)]">
                                            {serverError}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-end gap-2">
                                        {props.serverUrl && (
                                            <Button type="button" variant="outline" onClick={handleClearServer}>
                                                {t('login.server.useSameOrigin')}
                                            </Button>
                                        )}
                                        <Button type="submit">
                                            {t('login.server.save')}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="absolute bottom-4 left-0 right-0 space-y-1 text-center text-xs text-[var(--text-tertiary)]">
                <div>{t('login.footer')} <span className="text-[var(--danger)]">♥</span> {t('login.footer.for')}</div>
                <div>{t('login.footer.copyright')} {new Date().getFullYear()} HAQI</div>
            </div>
        </div>
    )
}
