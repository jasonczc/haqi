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
