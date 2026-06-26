import { describe, expect, it } from 'vitest';
import { buildPermissionQuestionAnswers, extractPermissionQuestionTarget } from './questionToolPrompt';

describe('extractPermissionQuestionTarget', () => {
    it('extracts MCP tool targets from permission questions', () => {
        expect(extractPermissionQuestionTarget({
            questions: [
                {
                    question: 'Allow the playwright MCP server to run tool "browser_navigate"?'
                }
            ]
        })).toEqual({
            toolName: 'mcp__playwright__browser_navigate',
            input: {
                server: 'playwright',
                tool: 'browser_navigate'
            }
        });
    });

    it('returns null for genuine user questions', () => {
        expect(extractPermissionQuestionTarget({
            questions: [
                {
                    question: 'Which branch should I edit?'
                }
            ]
        })).toBeNull();
    });

    it('builds synthetic answers for AskUserQuestion permissions', () => {
        expect(buildPermissionQuestionAnswers('AskUserQuestion', {
            questions: [
                {
                    id: '0',
                    question: 'Allow the playwright MCP server to run tool "browser_navigate"?',
                    options: [
                        { label: 'Yes' },
                        { label: 'No' }
                    ]
                }
            ]
        }, false)).toEqual({
            'Allow the playwright MCP server to run tool "browser_navigate"?': ['No']
        });
    });

    it('builds nested synthetic answers for request_user_input permissions', () => {
        expect(buildPermissionQuestionAnswers('request_user_input', {
            questions: [
                {
                    id: 'confirm',
                    question: 'Allow the playwright MCP server to run tool "browser_click"?',
                    options: [
                        { label: 'Allow' },
                        { label: 'Deny' }
                    ]
                }
            ]
        }, true)).toEqual({
            confirm: {
                answers: ['Allow']
            }
        });
    });
});
