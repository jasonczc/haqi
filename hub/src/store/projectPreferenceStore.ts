import type { Database } from 'bun:sqlite'

import {
    getProjectOfflineDirectories,
    replaceProjectOfflineDirectories
} from './projectPreferences'

export class ProjectPreferenceStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getProjectOfflineDirectories(namespace: string, userId: number): string[] {
        return getProjectOfflineDirectories(this.db, namespace, userId)
    }

    replaceProjectOfflineDirectories(
        namespace: string,
        userId: number,
        directories: string[]
    ): string[] {
        return replaceProjectOfflineDirectories(this.db, namespace, userId, directories)
    }
}
