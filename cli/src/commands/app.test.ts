import { describe, expect, it, vi } from 'vitest'
import { buildDesktopAppUrl, openDesktopUrl } from './app'

describe('app command helpers', () => {
    it('builds a desktop deep link with an absolute workspace folder', () => {
        expect(buildDesktopAppUrl('project', '/Users/me/workspace'))
            .toBe('haqi://code/new?folder=%2FUsers%2Fme%2Fworkspace%2Fproject')
    })

    it('uses the current directory when no path is provided', () => {
        expect(buildDesktopAppUrl(undefined, '/Users/me/workspace'))
            .toBe('haqi://code/new?folder=%2FUsers%2Fme%2Fworkspace')
    })

    it('uses open on macOS', () => {
        const spawn = vi.fn(() => ({ status: 0, stderr: Buffer.alloc(0) }))
        const result = openDesktopUrl('haqi://sessions', 'darwin', spawn as never)

        expect(result).toEqual({ success: true })
        expect(spawn).toHaveBeenCalledWith('open', ['haqi://sessions'], { stdio: 'pipe' })
    })

    it('uses cmd start on Windows', () => {
        const spawn = vi.fn(() => ({ status: 0, stderr: Buffer.alloc(0) }))
        const result = openDesktopUrl('haqi://sessions', 'win32', spawn as never)

        expect(result).toEqual({ success: true })
        expect(spawn).toHaveBeenCalledWith('cmd', ['/c', 'start', '', 'haqi://sessions'], {
            stdio: 'pipe',
            windowsHide: true
        })
    })
})
