import { describe, expect, it } from 'bun:test'

import { Store } from './index'

describe('CloudAgentPreferenceStore', () => {
    it('upserts and reads per-user preferences', () => {
        const store = new Store(':memory:')
        const user = store.users.addUser('telegram', 'u1', 'default')

        const first = store.cloudAgentPreferences.upsertPreferences('default', user.id, {
            gitName: '  Jane Doe  ',
            gitEmail: 'jane@example.com',
            githubUsername: ' janedoe ',
            branchPrefix: ' haqi/ ',
            baseBranch: ' main ',
            defaultRepositoryUrl: ' https://github.com/acme/demo.git ',
        })

        expect(first.gitName).toBe('Jane Doe')
        expect(first.gitEmail).toBe('jane@example.com')
        expect(first.githubUsername).toBe('janedoe')
        expect(first.branchPrefix).toBe('haqi/')
        expect(first.baseBranch).toBe('main')
        expect(first.defaultRepositoryUrl).toBe('https://github.com/acme/demo.git')

        const second = store.cloudAgentPreferences.upsertPreferences('default', user.id, {
            branchPrefix: '',
            baseBranch: 'develop',
        })

        expect(second.gitName).toBe('Jane Doe')
        expect(second.branchPrefix).toBeNull()
        expect(second.baseBranch).toBe('develop')
    })

    it('isolates preferences by namespace and user', () => {
        const store = new Store(':memory:')
        const userA = store.users.addUser('telegram', 'u-a', 'default')
        const userB = store.users.addUser('telegram', 'u-b', 'default')
        const teamUser = store.users.addUser('telegram', 'u-team', 'team')

        store.cloudAgentPreferences.upsertPreferences('default', userA.id, { gitName: 'A' })
        store.cloudAgentPreferences.upsertPreferences('default', userB.id, { gitName: 'B' })
        store.cloudAgentPreferences.upsertPreferences('team', teamUser.id, { gitName: 'Team' })

        expect(store.cloudAgentPreferences.getPreferences('default', userA.id)?.gitName).toBe('A')
        expect(store.cloudAgentPreferences.getPreferences('default', userB.id)?.gitName).toBe('B')
        expect(store.cloudAgentPreferences.getPreferences('team', teamUser.id)?.gitName).toBe('Team')
        expect(store.cloudAgentPreferences.getPreferences('team', userA.id)).toBeNull()
    })
})
