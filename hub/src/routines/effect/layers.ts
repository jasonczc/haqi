/**
 * Effect layer stack for the routines workflow engine.
 *
 * Stack (bottom → top):
 *
 *   SqliteClient(filename)           // @effect/sql-sqlite-bun
 *         │
 *         ▼
 *   SingleRunner(runnerStorage:sql)  // @effect/cluster — no clustering infra,
 *         │                              but uses SQL for crash-safe message storage
 *         ▼
 *   ClusterWorkflowEngine            // @effect/workflow engine driven by cluster
 *         │
 *         ▼
 *   WorkflowEngine service tag
 *
 * The SQLite file is a DEDICATED database (`routines-effect.db` next to
 * the main hub SQLite). We deliberately do NOT share tables with the
 * hub's primary store — cluster_* tables are Effect's internal schema
 * and we don't want drift to rot our own migrations.
 */

import { Layer } from 'effect'
import { ClusterWorkflowEngine, SingleRunner } from '@effect/cluster'
import { SqliteClient } from '@effect/sql-sqlite-bun'

export type EffectLayersConfig = {
    /** Absolute path to the SQLite file used by the workflow engine. */
    dbPath: string
}

export function buildEffectLayers(config: EffectLayersConfig) {
    const sqliteLayer = SqliteClient.layer({
        filename: config.dbPath,
        create: true
    })

    const runnerLayer = SingleRunner.layer({ runnerStorage: 'sql' }).pipe(
        Layer.provide(sqliteLayer)
    )

    const engineLayer = ClusterWorkflowEngine.layer.pipe(
        Layer.provide(runnerLayer)
    )

    return { sqliteLayer, runnerLayer, engineLayer }
}
