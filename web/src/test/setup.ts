import '@testing-library/jest-dom/vitest'

function createStorageStub(): Storage {
    const storage = new Map<string, string>()

    return {
        get length() {
            return storage.size
        },
        clear() {
            storage.clear()
        },
        getItem(key: string) {
            return storage.get(key) ?? null
        },
        key(index: number) {
            return Array.from(storage.keys())[index] ?? null
        },
        removeItem(key: string) {
            storage.delete(key)
        },
        setItem(key: string, value: string) {
            storage.set(key, String(value))
        }
    }
}

if (typeof window !== 'undefined') {
    if (typeof window.localStorage?.getItem !== 'function') {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            writable: true,
            value: createStorageStub()
        })
    }

    if (typeof globalThis.localStorage?.getItem !== 'function') {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            writable: true,
            value: window.localStorage
        })
    }

    if (typeof window.matchMedia !== 'function') {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false
            })
        })
    }
}

if (typeof navigator !== 'undefined' && typeof navigator.vibrate !== 'function') {
    Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        writable: true,
        value: () => false
    })
}
