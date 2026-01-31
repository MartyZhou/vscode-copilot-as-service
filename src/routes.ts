/**
 * HTTP route handlers for the Copilot as Service API
 */
import * as vscode from 'vscode';
import * as http from 'http';
import { ChatCompletionRequest, ToolInvokeRequest, FileOpenRequest, WorkspaceSearchRequest, FileEditRequest, FileReadRequest } from './types';
import { handleStreamingResponse, handleNonStreamingResponse } from './handlers/responseHandler';
import { prepareToolsForRequest, mapToolChoice, listTools, invokeTool } from './handlers/toolHandler';
import { prepareChatMessages } from './handlers/messageHandler';
import { openFileInEditor, searchWorkspaceCode, editFile, readFileContent } from './handlers/workspaceHandler';

/**
 * Handle chat completions request
 */
export async function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: ChatCompletionRequest = JSON.parse(body);

        const config = vscode.workspace.getConfiguration('copilotAsService');
        const defaultModel = config.get<string>('model', 'gpt-4o-mini');
        const modelToUse = requestData.model || defaultModel;

        // Get available models
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: modelToUse
        });

        if (models.length === 0) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: `Model ${modelToUse} is not available. Make sure GitHub Copilot is enabled.`,
                    type: 'model_not_available',
                    code: 'model_not_available'
                }
            }));
            return;
        }

        const model = models[0];
        const messages = requestData.messages || [];
        let stream = requestData.stream || false;
        const includeWorkspaceContext = requestData.includeWorkspaceContext !== false;
        const tools = requestData.tools || [];
        const toolChoice = requestData.tool_choice;
        
        // Force non-streaming mode when tools are provided
        // Tool invocation requires collecting the full response to detect tool calls,
        // invoking the tools, and sending follow-up requests - this flow is incompatible with SSE streaming
        if (stream && tools.length > 0) {
            console.warn('[Copilot Service] WARNING: Streaming mode is not supported with tool invocation. Forcing non-streaming mode.');
            stream = false;
        }
        
        console.log('[Copilot Service] Request received:');
        console.log('[Copilot Service]   - Messages:', messages.length);
        console.log('[Copilot Service]   - Tools:', tools.length);
        console.log('[Copilot Service]   - Streaming:', stream);
        console.log('[Copilot Service]   - Include workspace context:', includeWorkspaceContext);
        console.log('[Copilot Service]   - File reads:', requestData.fileReads?.length || 0);
        console.log('[Copilot Service]   - Code search:', requestData.codeSearch ? 'enabled' : 'disabled');

        // Prepare chat messages
        const chatMessages = await prepareChatMessages({
            messages,
            includeWorkspaceContext,
            responseFormat: requestData.response_format,
            fileReads: requestData.fileReads,
            codeSearch: requestData.codeSearch
        });

        // Prepare tools for the request
        const toolsForRequest = prepareToolsForRequest(tools);
        const toolMode = mapToolChoice(toolChoice, !!toolsForRequest);
        
        if (toolMode) {
            console.log('[Copilot Service] Tool mode:', toolMode === vscode.LanguageModelChatToolMode.Required ? 'Required' : 'Auto');
        }

        const requestOptions: vscode.LanguageModelChatRequestOptions = {
            justification: requestData.justification || 'External API request via Copilot as Service',
            tools: toolsForRequest,
            toolMode: toolMode
        };
        
        // Log informational parameters (not supported by VS Code LM API)
        if (requestData.temperature !== undefined) {
            console.log('[Copilot Service] Temperature parameter:', requestData.temperature, '(informational only)');
        }
        if (requestData.top_p !== undefined) {
            console.log('[Copilot Service] Top_p parameter:', requestData.top_p, '(informational only)');
        }
        if (requestData.max_tokens !== undefined) {
            console.log('[Copilot Service] Max_tokens parameter:', requestData.max_tokens, '(informational only)');
        }

        // Send initial request to the language model
        const chatResponse = await model.sendRequest(chatMessages, requestOptions);
        
        if (stream) {
            // Handle streaming response (tool invocation not supported in streaming mode)
            await handleStreamingResponse(res, chatResponse, modelToUse);
        } else {
            // Handle non-streaming response with automatic tool invocation
            const fullText = await handleNonStreamingResponse(
                model, 
                chatResponse, 
                chatMessages, 
                requestOptions
            );
            
            // Send final response
            const response = {
                id: 'chatcmpl-' + Date.now(),
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: modelToUse,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: fullText
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: -1,
                    completion_tokens: -1,
                    total_tokens: -1
                }
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'internal_error',
                code: 'internal_error'
            }
        }));
    }
}

/**
 * Handle models list request
 */
export async function handleModels(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const models = await vscode.lm.selectChatModels();
        const data = models.map(model => ({
            id: model.id,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: model.vendor ?? 'github-copilot',
            name: model.name,
            family: model.family,
            vendor: model.vendor
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'internal_error',
                code: 'internal_error'
            }
        }));
    }
}

/**
 * Handle tools list request
 */
export async function handleToolsList(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const tools = listTools();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        object: 'list',
        data: tools
    }));
}

/**
 * Handle tool invocation request
 */
export async function handleToolInvoke(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: ToolInvokeRequest = JSON.parse(body);

        const toolName = requestData.tool_name || requestData.name;
        const parameters = requestData.parameters || requestData.arguments || {};

        if (!toolName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'tool_name is required',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            }));
            return;
        }

        const resultText = await invokeTool(toolName, parameters, requestData.toolInvocationToken);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            tool_name: toolName,
            result: resultText,
            success: true
        }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Copilot Service] Tool invocation error:`, errorMessage);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'tool_invocation_error',
                code: 'tool_invocation_error'
            }
        }));
    }
}

/**
 * Handle file open request
 */
export async function handleFileOpen(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: FileOpenRequest = JSON.parse(body);
        
        const filePath = requestData.filePath || requestData.path;
        const line = requestData.line;
        
        if (!filePath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'filePath is required',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            }));
            return;
        }
        
        const success = await openFileInEditor(filePath, line);
        
        res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success,
            filePath,
            line
        }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'file_open_error',
                code: 'file_open_error'
            }
        }));
    }
}

/**
 * Handle workspace search request
 */
export async function handleWorkspaceSearch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: WorkspaceSearchRequest = JSON.parse(body);
        
        const query = requestData.query;
        const filePattern = requestData.filePattern;
        const maxResults = requestData.maxResults || 20;
        
        if (!query) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'query is required',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            }));
            return;
        }
        
        const results = await searchWorkspaceCode(query, filePattern, maxResults);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            query,
            filePattern,
            results,
            success: true
        }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'search_error',
                code: 'search_error'
            }
        }));
    }
}

/**
 * Handle health check request
 */
export function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
}

/**
 * Handle file edit request - edit files by replacing text
 */
export async function handleFileEdit(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: FileEditRequest = JSON.parse(body);
        
        const filePath = requestData.filePath;
        
        if (!filePath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'filePath is required',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            }));
            return;
        }
        
        // Build replacements array
        const replacements: Array<{ oldString: string; newString: string }> = [];
        
        if (requestData.replacements && requestData.replacements.length > 0) {
            replacements.push(...requestData.replacements);
        } else if (requestData.oldString !== undefined && requestData.newString !== undefined) {
            replacements.push({
                oldString: requestData.oldString,
                newString: requestData.newString
            });
        }
        
        if (replacements.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'Either replacements array or oldString/newString is required',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            }));
            return;
        }
        
        const result = await editFile(filePath, replacements);
        
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...result,
            filePath
        }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'file_edit_error',
                code: 'file_edit_error'
            }
        }));
    }
}

/**
 * Handle file read request - read file content
 */
export async function handleFileRead(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: FileReadRequest = JSON.parse(body);
        
        const filePath = requestData.filePath;
        
        if (!filePath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'filePath is required',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            }));
            return;
        }
        
        const result = await readFileContent(filePath, requestData.startLine, requestData.endLine);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            filePath,
            ...result,
            success: true
        }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'file_read_error',
                code: 'file_read_error'
            }
        }));
    }
}

/**
 * Read request body as string
 */
function readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: unknown) => {
            body += chunk?.toString();
        });
        req.on('end', () => {
            resolve(body);
        });
        req.on('error', reject);
    });
}
