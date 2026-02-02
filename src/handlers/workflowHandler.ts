/**
 * Workflow suggestions and context management
 */
import { ChatCompletionRequest, SuggestedAction } from '../types';

/**
 * Generate suggested next actions based on the current operation and response
 */
export function generateNextActions(
    request: ChatCompletionRequest,
    response: string,
    fileOperationType?: string,
    filePath?: string
): SuggestedAction[] {
    const suggestions: SuggestedAction[] = [];
    
    if (!request.suggestNextActions) {
        return suggestions;
    }

    // Analyze what was done and suggest logical next steps
    if (fileOperationType) {
        switch (fileOperationType) {
            case 'read': {
                if (filePath) {
                    // Suggest editing the file
                    suggestions.push({
                        description: 'Edit the file based on analysis',
                        reasoning: 'After reading and understanding the file, you might want to make changes',
                        request: {
                            messages: [
                                { role: 'system', content: 'Previous context: Analyzed ' + filePath },
                                { role: 'user', content: 'Make the necessary improvements or fixes to this file' }
                            ],
                            fileOperation: {
                                type: 'read',
                                filePath: filePath
                            },
                            suggestNextActions: true
                        }
                    });

                    // Suggest searching for related code
                    const fileBaseName = filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
                    if (fileBaseName) {
                        suggestions.push({
                            description: 'Find related code and dependencies',
                            reasoning: 'Understanding how this file is used in other parts of the codebase',
                            request: {
                                messages: [
                                    { role: 'system', content: 'Previous context: Analyzed ' + filePath },
                                    { role: 'user', content: 'Show me where this is used and related code' }
                                ],
                                fileOperation: {
                                    type: 'search',
                                    query: fileBaseName,
                                    maxResults: 10
                                },
                                suggestNextActions: true
                            }
                        });
                    }

                    // Suggest opening in editor
                    suggestions.push({
                        description: 'Open file in editor for manual review',
                        reasoning: 'Visual inspection in the editor can reveal additional insights',
                        request: {
                            messages: [
                                { role: 'user', content: 'Open this file for me to review' }
                            ],
                            fileOperation: {
                                type: 'open',
                                filePath: filePath
                            },
                            suggestNextActions: false
                        }
                    });
                }
                break;
            }

            case 'search': {
                // Suggest reading one of the found files
                const fileMatches = response.match(/## ([\w/.+-]+)/g);
                if (fileMatches && fileMatches.length > 0) {
                    const firstFile = fileMatches[0].replace('## ', '');
                    suggestions.push({
                        description: 'Read the most relevant file from search results',
                        reasoning: 'Deep dive into the most relevant file to understand the implementation',
                        request: {
                            messages: [
                                { role: 'system', content: 'Previous context: Searched and found relevant files' },
                                { role: 'user', content: 'Explain this file in detail' }
                            ],
                            fileOperation: {
                                type: 'read',
                                filePath: firstFile
                            },
                            suggestNextActions: true
                        }
                    });
                }

                // Suggest refining the search
                if (request.fileOperation?.query) {
                    suggestions.push({
                        description: 'Refine search with more specific terms',
                        reasoning: 'A more targeted search can find exactly what you need',
                        request: {
                            messages: [
                                { role: 'user', content: 'Search for more specific implementation details' }
                            ],
                            fileOperation: {
                                type: 'search',
                                query: request.fileOperation.query,
                                filePattern: '**/*.ts',
                                maxResults: 5
                            },
                            suggestNextActions: true
                        }
                    });
                }
                break;
            }

            case 'edit': {
                if (filePath) {
                    // Suggest reading the file to verify changes
                    suggestions.push({
                        description: 'Verify the changes made to the file',
                        reasoning: 'Confirm the edits were applied correctly',
                        request: {
                            messages: [
                                { role: 'system', content: 'Previous context: Edited ' + filePath },
                                { role: 'user', content: 'Show me the updated file to verify changes' }
                            ],
                            fileOperation: {
                                type: 'read',
                                filePath: filePath
                            },
                            suggestNextActions: true
                        }
                    });

                    // Suggest searching for related files that might need updates
                    suggestions.push({
                        description: 'Find related files that might need similar updates',
                        reasoning: 'Ensure consistency across the codebase',
                        request: {
                            messages: [
                                { role: 'system', content: 'Previous context: Made edits to ' + filePath },
                                { role: 'user', content: 'Find other files that might need similar updates' }
                            ],
                            fileOperation: {
                                type: 'search',
                                query: filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || '',
                                maxResults: 10
                            },
                            suggestNextActions: true
                        }
                    });

                    // Suggest opening to review
                    suggestions.push({
                        description: 'Open the edited file for manual review',
                        reasoning: 'Visual inspection to ensure quality',
                        request: {
                            messages: [
                                { role: 'user', content: 'Open the edited file' }
                            ],
                            fileOperation: {
                                type: 'open',
                                filePath: filePath
                            },
                            suggestNextActions: false
                        }
                    });
                }
                break;
            }

            case 'open': {
                if (filePath) {
                    // Suggest reading for AI analysis
                    suggestions.push({
                        description: 'Analyze the opened file with AI',
                        reasoning: 'Get AI insights about the code structure and quality',
                        request: {
                            messages: [
                                { role: 'user', content: 'Review this file for potential improvements' }
                            ],
                            fileOperation: {
                                type: 'read',
                                filePath: filePath
                            },
                            suggestNextActions: true
                        }
                    });
                }
                break;
            }
        }
    } else {
        // No file operation - suggest general next steps based on conversation
        const lowerResponse = response.toLowerCase();
        
        // If AI mentioned files, suggest reading them
        const filePattern = /([a-zA-Z0-9_/-]+\.(ts|js|py|json|md|txt))/g;
        const mentionedFiles = response.match(filePattern);
        if (mentionedFiles && mentionedFiles.length > 0) {
            const firstFile = mentionedFiles[0];
            suggestions.push({
                description: 'Read the mentioned file: ' + firstFile,
                reasoning: 'The AI referenced this file in the response',
                request: {
                    messages: [
                        { role: 'system', content: 'Previous context: Discussed ' + firstFile },
                        { role: 'user', content: 'Show me this file and explain it' }
                    ],
                    fileOperation: {
                        type: 'read',
                        filePath: firstFile
                    },
                    suggestNextActions: true
                }
            });
        }

        // If AI suggested searching, provide search action
        if (lowerResponse.includes('search') || lowerResponse.includes('find')) {
            suggestions.push({
                description: 'Search the workspace for relevant code',
                reasoning: 'Find specific implementations or patterns',
                request: {
                    messages: [
                        { role: 'user', content: 'Search for the implementation' }
                    ],
                    fileOperation: {
                        type: 'search',
                        query: 'implementation',
                        maxResults: 10
                    },
                    suggestNextActions: true
                }
            });
        }

        // General workflow suggestion
        suggestions.push({
            description: 'Ask a follow-up question',
            reasoning: 'Continue the conversation for more details',
            request: {
                messages: [
                    ...request.messages,
                    { role: 'assistant', content: response },
                    { role: 'user', content: 'Tell me more about this' }
                ],
                includeWorkspaceContext: true,
                suggestNextActions: true
            }
        });
    }

    // Limit to top 3 suggestions
    return suggestions.slice(0, 3);
}

/**
 * Build context summary for next actions
 */
export function buildContextSummary(
    request: ChatCompletionRequest,
    fileOperationType?: string,
    filePath?: string
): string {
    const parts: string[] = [];

    if (fileOperationType && filePath) {
        parts.push(`Last action: ${fileOperationType} on ${filePath}`);
    }

    if (request.messages.length > 0) {
        const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user');
        if (lastUserMessage) {
            parts.push(`Last question: "${lastUserMessage.content.substring(0, 100)}${lastUserMessage.content.length > 100 ? '...' : ''}"`);
        }
    }

    return parts.join('\n');
}
