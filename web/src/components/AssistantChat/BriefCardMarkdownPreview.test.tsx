import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BriefCardMarkdownPreview } from './BriefCardMarkdownPreview'
import { BriefFullMarkdownContent } from './BriefFullMarkdownContent'

describe('BriefCardMarkdownPreview', () => {
    it('keeps horizontal overflow visible so nested list markers are not clipped', () => {
        const { container } = render(
            <BriefCardMarkdownPreview
                content={`1. Parent\n   - Child\n2. Next`}
            />
        )

        expect(container.firstElementChild?.className).toContain('overflow-y-hidden')
        expect(container.firstElementChild?.className).not.toContain('overflow-hidden')
        expect(container.querySelector('ol')?.className).toContain('list-decimal')
        expect(container.querySelector('ul')?.className).toContain('list-disc')
        expect(within(container).getByText('Child')).toBeInTheDocument()
    })
})

describe('BriefFullMarkdownContent', () => {
    it('renders nested lists in latest full-content path too', () => {
        const { container } = render(
            <BriefFullMarkdownContent
                content={`1. Parent\n   - Child\n2. Next`}
            />
        )

        expect(container.querySelector('ol')?.className).toContain('list-decimal')
        expect(container.querySelector('ul')?.className).toContain('list-disc')
        expect(within(container).getByText('Child')).toBeInTheDocument()
    })
})
