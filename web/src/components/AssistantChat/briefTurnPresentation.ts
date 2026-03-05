export function isBriefTurnLive(params: {
    status: 'open' | 'closed'
    thinking: boolean
    isActiveStreamingTurn: boolean
}): boolean {
    return params.status === 'open'
        && params.thinking
        && params.isActiveStreamingTurn
}

export function shouldShowLatestBriefTurnAsFullContent(params: {
    isLatestTurn: boolean
    isLiveTurn: boolean
}): boolean {
    return params.isLatestTurn && !params.isLiveTurn
}

export function shouldFetchLatestTurnChangesSummary(params: {
    latestTurnId: string | null
    latestTurnUpdatedAt: number | null
    fetchedUpdatedAtByTurnId: Record<string, number>
    inFlightTurnIds: Set<string>
}): boolean {
    if (!params.latestTurnId || params.latestTurnUpdatedAt === null) {
        return false
    }

    if (params.inFlightTurnIds.has(params.latestTurnId)) {
        return false
    }

    return params.fetchedUpdatedAtByTurnId[params.latestTurnId] !== params.latestTurnUpdatedAt
}
