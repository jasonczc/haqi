// @vitest-environment jsdom
import type { ComponentPropsWithoutRef, ComponentType } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { defaultComponents } from '@/components/assistant-ui/markdown-text'

const A = defaultComponents.a! as ComponentType<ComponentPropsWithoutRef<'a'>>

function renderLink(props: { href: string; target?: string }) {
    const { container } = render(<A {...props}>x</A>)
    return container.querySelector('a')!
}

describe('markdown link', () => {
    it('opens absolute http(s) links in a new context, so a standalone PWA is not navigated away', () => {
        const link = renderLink({ href: 'https://hub.example/share/r/abc123' })
        expect(link.getAttribute('target')).toBe('_blank')
        expect(link.getAttribute('rel')).toBe('noreferrer')
    })

    it('leaves relative and hash links alone', () => {
        expect(renderLink({ href: '#section' }).getAttribute('target')).toBeNull()
    })

    it('keeps an explicit target from the markdown', () => {
        expect(renderLink({ href: 'https://example.test/', target: '_self' }).getAttribute('target')).toBe('_self')
    })
})
