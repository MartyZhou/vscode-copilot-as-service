/**
 * Tool handling utilities
 */
import * as vscode from 'vscode';
import { OpenAITool } from '../types';

/**
 * Convert OpenAI-style tools to VS Code LanguageModelChatTool format
 */
export function prepareToolsForRequest(tools: Array<OpenAITool | string>): vscode.LanguageModelChatTool[] | undefined {
    if (tools.length === 0) {
        return undefined;
    }
    
    const toolsForRequest: vscode.LanguageModelChatTool[] = [];
    
    for (const tool of tools) {
        // OpenAI-style tool format: { type: 'function', function: { name, description, parameters } }
        if (typeof tool === 'object' && tool.type === 'function' && tool.function) {
            const func = tool.function;
            const chatTool: vscode.LanguageModelChatTool = {
                name: func.name,
                description: func.description || `Tool: ${func.name}`,
                inputSchema: func.parameters as object | undefined
            };
            toolsForRequest.push(chatTool);
            console.log('[Copilot Service] Added tool:', func.name);
        }
        // Also support direct tool name references (lookup from lm.tools)
        else if (typeof tool === 'string' || (typeof tool === 'object' && tool.name)) {
            const toolName = typeof tool === 'string' ? tool : tool.name;
            const registeredTool = vscode.lm.tools.find(t => t.name === toolName);
            
            if (registeredTool) {
                const chatTool: vscode.LanguageModelChatTool = {
                    name: registeredTool.name,
                    description: registeredTool.description || `Tool: ${registeredTool.name}`,
                    inputSchema: registeredTool.inputSchema
                };
                toolsForRequest.push(chatTool);
                console.log('[Copilot Service] Added registered tool:', registeredTool.name);
            } else {
                console.warn('[Copilot Service] Tool not found in lm.tools:', toolName);
            }
        }
    }
    
    return toolsForRequest.length > 0 ? toolsForRequest : undefined;
}

/**
 * Map OpenAI tool_choice to VS Code toolMode
 */
export function mapToolChoice(
    toolChoice: string | { type: string; function: { name: string } } | undefined,
    hasTools: boolean
): vscode.LanguageModelChatToolMode | undefined {
    if (!hasTools || !toolChoice) {
        return undefined;
    }
    
    if (typeof toolChoice === 'string') {
        if (toolChoice === 'required') {
            return vscode.LanguageModelChatToolMode.Required;
        } else if (toolChoice === 'auto' || toolChoice === 'none') {
            return vscode.LanguageModelChatToolMode.Auto;
        }
    } else if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
        // Specific tool requested - use Required mode
        return vscode.LanguageModelChatToolMode.Required;
    }
    
    return undefined;
}

/**
 * List all available tools
 */
export function listTools(): Array<{ name: string; description: string | undefined }> {
    return vscode.lm.tools.map(tool => ({
        name: tool.name,
        description: tool.description
    }));
}

/**
 * Invoke a specific tool by name
 */
export async function invokeTool(
    toolName: string,
    parameters: Record<string, unknown>,
    _toolInvocationToken?: string
): Promise<string> {
    console.log(`[Copilot Service] Invoking tool: ${toolName}`);
    console.log(`[Copilot Service] Parameters:`, JSON.stringify(parameters, null, 2));

    // Find the tool
    const tool = vscode.lm.tools.find(t => t.name === toolName);
    if (!tool) {
        throw new Error(`Tool '${toolName}' not found`);
    }

    // Invoke the tool
    const options: vscode.LanguageModelToolInvocationOptions<object> = {
        toolInvocationToken: undefined,
        input: parameters
    };

    const result = await vscode.lm.invokeTool(toolName, options, new vscode.CancellationTokenSource().token);

    // Collect the result from content array
    const resultParts: string[] = [];
    for (const part of result.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
            resultParts.push(part.value);
        }
    }

    const resultText = resultParts.join('');
    console.log(`[Copilot Service] Tool result:`, resultText.substring(0, 200));

    return resultText;
}
