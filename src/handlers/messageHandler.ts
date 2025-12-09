/**
 * Message preparation and formatting utilities
 */
import * as vscode from 'vscode';
import { getWorkspaceContext, readMultipleFiles, searchWorkspaceCode } from './workspaceHandler';

export interface MessagePreparationOptions {
    messages: Array<{ role: string; content: string }>;
    includeWorkspaceContext: boolean;
    responseFormat?: { type: string; json_schema?: unknown };
    fileReads?: string[];
    codeSearch?: {
        query: string;
        filePattern?: string;
        maxResults?: number;
    };
}

/**
 * Prepare chat messages for the language model
 */
export async function prepareChatMessages(options: MessagePreparationOptions): Promise<vscode.LanguageModelChatMessage[]> {
    const chatMessages: vscode.LanguageModelChatMessage[] = [];
    
    // Extract system messages and combine them
    const systemMessages = options.messages.filter(msg => msg.role === 'system');
    const nonSystemMessages = options.messages.filter(msg => msg.role !== 'system');
    
    // Add combined system message as a user message with clear prefix if any exist
    if (systemMessages.length > 0) {
        const systemContent = systemMessages.map(msg => msg.content).join('\n\n');
        const systemMessage = `System Instructions:\n${systemContent}`;
        chatMessages.push(vscode.LanguageModelChatMessage.User(systemMessage));
        console.log('[Copilot Service] Added system instructions:', systemMessage.substring(0, 100));
    }
    
    // Add response format instruction if provided
    if (options.responseFormat) {
        const formatInstruction = formatResponseFormatInstruction(options.responseFormat);
        if (formatInstruction) {
            chatMessages.push(vscode.LanguageModelChatMessage.User(formatInstruction));
            console.log('[Copilot Service] Added response format instruction');
        }
    }
    
    // Add workspace context if requested
    if (options.includeWorkspaceContext) {
        const workspaceInfo = await getWorkspaceContext(options.includeWorkspaceContext);
        if (workspaceInfo) {
            chatMessages.push(vscode.LanguageModelChatMessage.User(workspaceInfo));
            console.log('[Copilot Service] Added workspace context');
        }
    }
    
    // Add file reads if specified
    if (options.fileReads && options.fileReads.length > 0) {
        const filesContent = await readMultipleFiles(options.fileReads);
        if (filesContent) {
            chatMessages.push(vscode.LanguageModelChatMessage.User(filesContent));
            console.log('[Copilot Service] Added', options.fileReads.length, 'file(s) content');
        }
    }
    
    // Add code search results if specified
    if (options.codeSearch) {
        const searchResults = await searchWorkspaceCode(
            options.codeSearch.query,
            options.codeSearch.filePattern,
            options.codeSearch.maxResults
        );
        if (searchResults) {
            chatMessages.push(vscode.LanguageModelChatMessage.User(searchResults));
            console.log('[Copilot Service] Added code search results');
        }
    }

    // Convert and add user/assistant messages
    for (const msg of nonSystemMessages) {
        if (msg.role === 'user') {
            chatMessages.push(vscode.LanguageModelChatMessage.User(msg.content));
            console.log('[Copilot Service] Added user message:', msg.content.substring(0, 100));
        } else if (msg.role === 'assistant') {
            chatMessages.push(vscode.LanguageModelChatMessage.Assistant(msg.content));
            console.log('[Copilot Service] Added assistant message:', msg.content.substring(0, 100));
        }
    }
    
    return chatMessages;
}

/**
 * Format response_format instruction for the model
 */
function formatResponseFormatInstruction(responseFormat: { type: string; json_schema?: unknown }): string | null {
    if (responseFormat.type === 'json_object') {
        return 'IMPORTANT: You must respond with a valid JSON object. Do not include any text outside the JSON structure.';
    } else if (responseFormat.type === 'json_schema' && responseFormat.json_schema) {
        return `IMPORTANT: You must respond with a valid JSON object that conforms to the following schema:\n\`\`\`json\n${JSON.stringify(responseFormat.json_schema, null, 2)}\n\`\`\`\nDo not include any text outside the JSON structure.`;
    }
    return null;
}
