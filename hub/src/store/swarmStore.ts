import type { Database } from 'bun:sqlite'
import {
    addSwarmEvent,
    addSwarmEffect,
    addSwarmActivity,
    addSwarmArtifact,
    addSwarmOutcome,
    addSwarmParticipant,
    addSwarmPolicy,
    addSwarmReview,
    addSwarmRoleBinding,
    addSwarmRoleBindingHistory,
    addSwarmRoleProfile,
    addSwarmThreadEntry,
    addSwarmWorkItemAssignment,
    releaseSwarmWorkItemAssignments,
    addSwarmThread,
    addSwarmTransition,
    createSwarm,
    getSwarmActivities,
    getSwarmArtifacts,
    getSwarmByNamespace,
    getSwarmEvents,
    getSwarmEffects,
    getSwarmOutcomes,
    getSwarmPolicies,
    getSwarmParticipantLeases,
    getSwarmReviews,
    getSwarmRoleBindings,
    getSwarmRoleBindingHistory,
    getSwarmRoleProfiles,
    getSwarmThreadEntries,
    getSwarmThreads,
    getSwarmWorkItemAssignments,
    getSwarmParticipantByRef,
    getSwarmParticipants,
    getSwarmWorkItemById,
    getSwarmWorkItems,
    getSwarmsByParticipantRef,
    getSwarmsByNamespace,
    getSwarmSubject,
    getSwarmTransitions,
    removeSwarmParticipant,
    resetSwarmRoleBindings,
    addSwarmWorkItem,
    updateSwarm,
    updateSwarmOutcome,
    updateSwarmReview,
    updateSwarmPolicy,
    updateSwarmRoleProfile,
    updateSwarmWorkItem,
    updateSwarmSubject,
    upsertSwarmParticipantLease
} from './swarms'
import type {
    StoredSwarm,
    StoredSwarmActivity,
    StoredSwarmArtifact,
    StoredSwarmEffect,
    StoredSwarmEvent,
    StoredSwarmOutcome,
    StoredSwarmParticipant,
    StoredSwarmParticipantLease,
    StoredSwarmPolicy,
    StoredSwarmReview,
    StoredSwarmRoleBinding,
    StoredSwarmRoleBindingHistory,
    StoredSwarmRoleProfile,
    StoredSwarmSubject,
    StoredSwarmThread,
    StoredSwarmThreadEntry,
    StoredSwarmTransition,
    StoredSwarmWorkItem,
    StoredSwarmWorkItemAssignment
} from './types'

export class SwarmStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    createSwarm(options: Parameters<typeof createSwarm>[1]): StoredSwarm {
        return createSwarm(this.db, options)
    }

    getSwarmsByNamespace(namespace: string): StoredSwarm[] {
        return getSwarmsByNamespace(this.db, namespace)
    }

    getSwarmsByParticipantRef(namespace: string, refId: string): StoredSwarm[] {
        return getSwarmsByParticipantRef(this.db, namespace, refId)
    }

    getSwarmByNamespace(swarmId: string, namespace: string): StoredSwarm | null {
        return getSwarmByNamespace(this.db, swarmId, namespace)
    }

    updateSwarm(options: Parameters<typeof updateSwarm>[1]): StoredSwarm | null {
        return updateSwarm(this.db, options)
    }

    getSwarmSubject(swarmId: string, namespace: string): StoredSwarmSubject | null {
        return getSwarmSubject(this.db, swarmId, namespace)
    }

    updateSwarmSubject(options: Parameters<typeof updateSwarmSubject>[1]): StoredSwarmSubject {
        return updateSwarmSubject(this.db, options)
    }

    getSwarmParticipants(swarmId: string, namespace: string): StoredSwarmParticipant[] {
        return getSwarmParticipants(this.db, swarmId, namespace)
    }

    getSwarmParticipantByRef(swarmId: string, namespace: string, refId: string): StoredSwarmParticipant | null {
        return getSwarmParticipantByRef(this.db, swarmId, namespace, refId)
    }

    addSwarmParticipant(options: Parameters<typeof addSwarmParticipant>[1]): StoredSwarmParticipant {
        return addSwarmParticipant(this.db, options)
    }

    removeSwarmParticipant(swarmId: string, namespace: string, participantId: string): boolean {
        return removeSwarmParticipant(this.db, swarmId, namespace, participantId)
    }

    getSwarmOutcomes(swarmId: string, namespace: string): StoredSwarmOutcome[] {
        return getSwarmOutcomes(this.db, swarmId, namespace)
    }

    addSwarmOutcome(options: Parameters<typeof addSwarmOutcome>[1]): StoredSwarmOutcome {
        return addSwarmOutcome(this.db, options)
    }

    updateSwarmOutcome(options: Parameters<typeof updateSwarmOutcome>[1]): StoredSwarmOutcome | null {
        return updateSwarmOutcome(this.db, options)
    }

    getSwarmWorkItems(swarmId: string, namespace: string): StoredSwarmWorkItem[] {
        return getSwarmWorkItems(this.db, swarmId, namespace)
    }

    getSwarmWorkItemById(swarmId: string, namespace: string, workItemId: string): StoredSwarmWorkItem | null {
        return getSwarmWorkItemById(this.db, swarmId, namespace, workItemId)
    }

    addSwarmWorkItem(options: Parameters<typeof addSwarmWorkItem>[1]): StoredSwarmWorkItem {
        return addSwarmWorkItem(this.db, options)
    }

    updateSwarmWorkItem(options: Parameters<typeof updateSwarmWorkItem>[1]): StoredSwarmWorkItem | null {
        return updateSwarmWorkItem(this.db, options)
    }



    getSwarmActivities(swarmId: string, namespace: string): StoredSwarmActivity[] {
        return getSwarmActivities(this.db, swarmId, namespace)
    }

    addSwarmActivity(options: Parameters<typeof addSwarmActivity>[1]): StoredSwarmActivity {
        return addSwarmActivity(this.db, options)
    }
    getSwarmArtifacts(swarmId: string, namespace: string): StoredSwarmArtifact[] {
        return getSwarmArtifacts(this.db, swarmId, namespace)
    }

    addSwarmArtifact(options: Parameters<typeof addSwarmArtifact>[1]): StoredSwarmArtifact {
        return addSwarmArtifact(this.db, options)
    }



    getSwarmRoleBindings(swarmId: string, namespace: string): StoredSwarmRoleBinding[] {
        return getSwarmRoleBindings(this.db, swarmId, namespace)
    }

    getSwarmRoleBindingHistory(swarmId: string, namespace: string): StoredSwarmRoleBindingHistory[] {
        return getSwarmRoleBindingHistory(this.db, swarmId, namespace)
    }

    getSwarmRoleProfiles(swarmId: string, namespace: string): StoredSwarmRoleProfile[] {
        return getSwarmRoleProfiles(this.db, swarmId, namespace)
    }

    addSwarmRoleBinding(options: Parameters<typeof addSwarmRoleBinding>[1]): StoredSwarmRoleBinding {
        return addSwarmRoleBinding(this.db, options)
    }

    addSwarmRoleBindingHistory(options: Parameters<typeof addSwarmRoleBindingHistory>[1]): StoredSwarmRoleBindingHistory {
        return addSwarmRoleBindingHistory(this.db, options)
    }

    addSwarmRoleProfile(options: Parameters<typeof addSwarmRoleProfile>[1]): StoredSwarmRoleProfile {
        return addSwarmRoleProfile(this.db, options)
    }

    updateSwarmRoleProfile(options: Parameters<typeof updateSwarmRoleProfile>[1]): StoredSwarmRoleProfile | null {
        return updateSwarmRoleProfile(this.db, options)
    }

    resetSwarmRoleBindings(options: Parameters<typeof resetSwarmRoleBindings>[1]): void {
        resetSwarmRoleBindings(this.db, options)
    }

    getSwarmThreads(swarmId: string, namespace: string): StoredSwarmThread[] {
        return getSwarmThreads(this.db, swarmId, namespace)
    }

    addSwarmThread(options: Parameters<typeof addSwarmThread>[1]): StoredSwarmThread {
        return addSwarmThread(this.db, options)
    }

    getSwarmPolicies(swarmId: string, namespace: string): StoredSwarmPolicy[] {
        return getSwarmPolicies(this.db, swarmId, namespace)
    }

    addSwarmPolicy(options: Parameters<typeof addSwarmPolicy>[1]): StoredSwarmPolicy {
        return addSwarmPolicy(this.db, options)
    }

    updateSwarmPolicy(options: Parameters<typeof updateSwarmPolicy>[1]): StoredSwarmPolicy | null {
        return updateSwarmPolicy(this.db, options)
    }
    getSwarmReviews(swarmId: string, namespace: string): StoredSwarmReview[] {
        return getSwarmReviews(this.db, swarmId, namespace)
    }

    addSwarmReview(options: Parameters<typeof addSwarmReview>[1]): StoredSwarmReview {
        return addSwarmReview(this.db, options)
    }

    updateSwarmReview(options: Parameters<typeof updateSwarmReview>[1]): StoredSwarmReview | null {
        return updateSwarmReview(this.db, options)
    }

    getSwarmThreadEntries(swarmId: string, namespace: string): StoredSwarmThreadEntry[] {
        return getSwarmThreadEntries(this.db, swarmId, namespace)
    }

    addSwarmThreadEntry(options: Parameters<typeof addSwarmThreadEntry>[1]): StoredSwarmThreadEntry {
        return addSwarmThreadEntry(this.db, options)
    }

    getSwarmWorkItemAssignments(swarmId: string, namespace: string): StoredSwarmWorkItemAssignment[] {
        return getSwarmWorkItemAssignments(this.db, swarmId, namespace)
    }

    addSwarmWorkItemAssignment(options: Parameters<typeof addSwarmWorkItemAssignment>[1]): StoredSwarmWorkItemAssignment {
        return addSwarmWorkItemAssignment(this.db, options)
    }

    releaseSwarmWorkItemAssignments(options: Parameters<typeof releaseSwarmWorkItemAssignments>[1]): StoredSwarmWorkItemAssignment[] {
        return releaseSwarmWorkItemAssignments(this.db, options)
    }

    getSwarmParticipantLeases(swarmId: string, namespace: string): StoredSwarmParticipantLease[] {
        return getSwarmParticipantLeases(this.db, swarmId, namespace)
    }

    upsertSwarmParticipantLease(options: Parameters<typeof upsertSwarmParticipantLease>[1]): StoredSwarmParticipantLease {
        return upsertSwarmParticipantLease(this.db, options)
    }

    getSwarmTransitions(swarmId: string, namespace: string): StoredSwarmTransition[] {
        return getSwarmTransitions(this.db, swarmId, namespace)
    }

    addSwarmTransition(options: Parameters<typeof addSwarmTransition>[1]): StoredSwarmTransition {
        return addSwarmTransition(this.db, options)
    }

    addSwarmEvent(options: Parameters<typeof addSwarmEvent>[1]): StoredSwarmEvent {
        return addSwarmEvent(this.db, options)
    }

    getSwarmEvents(swarmId: string, namespace: string): StoredSwarmEvent[] {
        return getSwarmEvents(this.db, swarmId, namespace)
    }

    addSwarmEffect(options: Parameters<typeof addSwarmEffect>[1]): StoredSwarmEffect {
        return addSwarmEffect(this.db, options)
    }

    getSwarmEffects(swarmId: string, namespace: string): StoredSwarmEffect[] {
        return getSwarmEffects(this.db, swarmId, namespace)
    }
}
