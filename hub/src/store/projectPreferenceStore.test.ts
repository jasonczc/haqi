import { describe, expect, it } from 'bun:test'

import { Store } from './index'

describe('ProjectPreferenceStore', () => {
    it('replaces project offline directories for a user', () => {
        const store = new Store(':memory:')
        const user = store.users.addUser('telegram', 'u1', 'default')

        const first = store.projectPreferences.replaceProjectOfflineDirectories(
            'default',
            user.id,
            ['/repo/a', ' /repo/b ', '/repo/a', '']
        )
        expect(first).toEqual(['/repo/a', '/repo/b'])
        expect(store.projectPreferences.getProjectOfflineDirectories('default', user.id)).toEqual(['/repo/a', '/repo/b'])

        const second = store.projectPreferences.replaceProjectOfflineDirectories(
            'default',
            user.id,
            ['/repo/c']
        )
        expect(second).toEqual(['/repo/c'])
        expect(store.projectPreferences.getProjectOfflineDirectories('default', user.id)).toEqual(['/repo/c'])
    })

    it('isolates project offline directories by namespace and user', () => {
        const store = new Store(':memory:')
        const defaultUserA = store.users.addUser('telegram', 'u-default-a', 'default')
        const defaultUserB = store.users.addUser('telegram', 'u-default-b', 'default')
        const teamUser = store.users.addUser('telegram', 'u-team', 'team')

        store.projectPreferences.replaceProjectOfflineDirectories(
            'default',
            defaultUserA.id,
            ['/repo/default-a']
        )
        store.projectPreferences.replaceProjectOfflineDirectories(
            'default',
            defaultUserB.id,
            ['/repo/default-b']
        )
        store.projectPreferences.replaceProjectOfflineDirectories(
            'team',
            teamUser.id,
            ['/repo/team']
        )

        expect(store.projectPreferences.getProjectOfflineDirectories('default', defaultUserA.id)).toEqual(['/repo/default-a'])
        expect(store.projectPreferences.getProjectOfflineDirectories('default', defaultUserB.id)).toEqual(['/repo/default-b'])
        expect(store.projectPreferences.getProjectOfflineDirectories('team', teamUser.id)).toEqual(['/repo/team'])
        expect(store.projectPreferences.getProjectOfflineDirectories('team', defaultUserA.id)).toEqual([])
    })
})
