type QuestionToolPermissionTarget = {
    toolName: string;
    input: {
        server: string;
        tool: string;
    };
};

type QuestionToolPermissionQuestion = {
    index: number;
    id: string;
    optionLabels: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

export function extractPermissionQuestionTarget(input: unknown): QuestionToolPermissionTarget | null {
    const matchedQuestion = findPermissionQuestion(input);
    if (!matchedQuestion) {
        return null;
    }

    return {
        toolName: `mcp__${matchedQuestion.input.server}__${matchedQuestion.input.tool}`,
        input: matchedQuestion.input
    };
}

function findPermissionQuestion(input: unknown): (QuestionToolPermissionQuestion & {
    input: {
        server: string;
        tool: string;
    };
}) | null {
    const inputRecord = asRecord(input);
    const rawQuestions = Array.isArray(inputRecord?.questions) ? inputRecord.questions : null;
    if (!rawQuestions || rawQuestions.length === 0) {
        return null;
    }

    for (const [index, rawQuestion] of rawQuestions.entries()) {
        const questionRecord = asRecord(rawQuestion);
        const question = typeof questionRecord?.question === 'string'
            ? questionRecord.question.trim()
            : '';
        if (!question) {
            continue;
        }

        const match = question.match(/^Allow the ([A-Za-z0-9._-]+) MCP server to run tool "([^"]+)"\?$/i);
        if (!match) {
            continue;
        }

        const server = match[1]?.trim();
        const tool = match[2]?.trim();
        if (!server || !tool) {
            continue;
        }

        return {
            index,
            id: typeof questionRecord?.id === 'string' && questionRecord.id.trim().length > 0
                ? questionRecord.id.trim()
                : String(index),
            input: {
                server,
                tool
            },
            optionLabels: Array.isArray(questionRecord?.options)
                ? questionRecord.options
                    .map((option) => asRecord(option))
                    .map((option) => typeof option?.label === 'string' ? option.label.trim() : '')
                    .filter((label) => label.length > 0)
                : []
        };
    }

    return null;
}

function selectAnswerLabel(optionLabels: string[], approved: boolean): string {
    if (approved) {
        return optionLabels[0] || 'Yes';
    }
    return optionLabels[1] || optionLabels[0] || 'No';
}

export function buildPermissionQuestionAnswers(
    toolName: string,
    input: unknown,
    approved: boolean
): Record<string, string[]> | Record<string, { answers: string[] }> | null {
    const matchedQuestion = findPermissionQuestion(input);
    if (!matchedQuestion) {
        return null;
    }

    const answerLabel = selectAnswerLabel(matchedQuestion.optionLabels, approved);

    if (toolName === 'request_user_input') {
        return {
            [matchedQuestion.id]: {
                answers: [answerLabel]
            }
        };
    }

    if (toolName === 'AskUserQuestion' || toolName === 'ask_user_question') {
        return {
            [String(matchedQuestion.index)]: [answerLabel]
        };
    }

    return null;
}
