import type { Database } from 'bun:sqlite'

import type { StoredCloudAgentPreferences } from './cloudAgentPreferences'
import { getCloudAgentPreferences, upsertCloudAgentPreferences } from './cloudAgentPreferences'

export class CloudAgentPreferenceStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getPreferences(namespace: string, userId: number): StoredCloudAgentPreferences | null {
        return getCloudAgentPreferences(this.db, namespace, userId)
    }

    upsertPreferences(
        namespace: string,
        userId: number,
        updates: {
            gitName?: string | null
            gitEmail?: string | null
            githubUsername?: string | null
            branchPrefix?: string | null
            baseBranch?: string | null
            defaultRepositoryUrl?: string | null
        }
    ): StoredCloudAgentPreferences {
        return upsertCloudAgentPreferences(this.db, namespace, userId, updates)
    }
}
