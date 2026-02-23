/**
 * HTTP route handlers for the Copilot as Service API
 */
import * as vscode from 'vscode';
import * as http from 'http';
import { ChatCompletionRequest, ToolInvokeRequest, FileOpenRequest, WorkspaceSearchRequest, FileEditRequest, FileReadRequest, OllamaGenerateRequest, OllamaChatRequest, OllamaShowRequest } from './types';
import { handleStreamingResponse, handleNonStreamingResponse } from './handlers/responseHandler';
import { prepareToolsForRequest, mapToolChoice, listTools, invokeTool } from './handlers/toolHandler';
import { prepareChatMessages } from './handlers/messageHandler';
import { openFileInEditor, searchWorkspaceCode, editFile, readFileContent, addFile } from './handlers/workspaceHandler';
import { generateNextActions, buildContextSummary } from './handlers/workflowHandler';

/**
 * Handle chat completions request
 */
export async function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: ChatCompletionRequest = JSON.parse(body);

        const config = vscode.workspace.getConfiguration('copilotAsService');
        const defaultModel = config.get<string>('model', 'gpt-5-mini');
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
        console.log('[Copilot Service]   - File operation:', requestData.fileOperation?.type || 'none');

        // Handle file operations before preparing chat messages
        let fileOperationResult: string | undefined;
        if (requestData.fileOperation) {
            const op = requestData.fileOperation;
            try {
                switch (op.type) {
                    case 'read': {
                        if (!op.filePath) {
                            throw new Error('filePath is required for read operation');
                        }
                        const readResult = await readFileContent(op.filePath, op.startLine, op.endLine);
                        fileOperationResult = `# File Read: ${op.filePath}\n\`\`\`${readResult.language}\n${readResult.content}\n\`\`\`\nTotal lines: ${readResult.totalLines}`;
                        console.log('[Copilot Service] File read successful:', op.filePath);
                        break;
                    }
                    
                    case 'edit': {
                        if (!op.filePath) {
                            throw new Error('filePath is required for edit operation');
                        }
                        const replacements: Array<{ oldString: string; newString: string }> = [];
                        if (op.replacements && op.replacements.length > 0) {
                            replacements.push(...op.replacements);
                        } else if (op.oldString !== undefined && op.newString !== undefined) {
                            replacements.push({ oldString: op.oldString, newString: op.newString });
                        } else {
                            throw new Error('Either replacements array or oldString/newString is required');
                        }
                        const editResult = await editFile(op.filePath, replacements);
                        fileOperationResult = `# File Edit: ${op.filePath}\nReplacements made: ${editResult.replacementsMade}\nSuccess: ${editResult.success}${editResult.errors.length > 0 ? '\nErrors: ' + editResult.errors.join(', ') : ''}`;
                        console.log('[Copilot Service] File edit completed:', op.filePath, editResult);
                        break;
                    }
                    
                    case 'open': {
                        if (!op.filePath) {
                            throw new Error('filePath is required for open operation');
                        }
                        const openSuccess = await openFileInEditor(op.filePath, op.line);
                        fileOperationResult = `# File Open: ${op.filePath}${op.line ? ` (line ${op.line})` : ''}\nSuccess: ${openSuccess}`;
                        console.log('[Copilot Service] File open:', op.filePath, openSuccess);
                        break;
                    }
                    
                    case 'search': {
                        if (!op.query) {
                            throw new Error('query is required for search operation');
                        }
                        const searchResult = await searchWorkspaceCode(op.query, op.filePattern, op.maxResults || 20);
                        fileOperationResult = searchResult || 'No search results';
                        console.log('[Copilot Service] Workspace search completed:', op.query);
                        break;
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                fileOperationResult = `# File Operation Error\nType: ${op.type}\nError: ${errorMessage}`;
                console.error('[Copilot Service] File operation error:', errorMessage);
            }
        }

        // Prepare chat messages
        const chatMessages = await prepareChatMessages({
            messages,
            includeWorkspaceContext,
            responseFormat: requestData.response_format,
            fileReads: requestData.fileReads,
            codeSearch: requestData.codeSearch,
            fileOperationResult
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
            
            // Generate suggested next actions if requested
            const suggestedActions = generateNextActions(
                requestData,
                fullText,
                requestData.fileOperation?.type,
                requestData.fileOperation?.filePath
            );

            const contextSummary = requestData.suggestNextActions 
                ? buildContextSummary(requestData, requestData.fileOperation?.type, requestData.fileOperation?.filePath)
                : undefined;
            
            // Send final response
            const response: Record<string, unknown> = {
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

            // Add workflow suggestions if requested
            if (requestData.suggestNextActions && suggestedActions.length > 0) {
                response.suggested_actions = suggestedActions;
                response.context_summary = contextSummary;
                console.log('[Copilot Service] Generated', suggestedActions.length, 'suggested next actions');
            }

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
 * Handle Ollama-compatible version endpoint
 */
export function handleOllamaVersion(_req: http.IncomingMessage, res: http.ServerResponse): void {
    sendJson(res, 200, { version: '0.5.7' });
}

/**
 * Handle Ollama-compatible model tags endpoint
 */
export async function handleOllamaTags(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const modelNames = await getAvailableOllamaModelNames();
        sendJson(res, 200, { models: modelNames.map((name: string) => buildOllamaModelTag(name)) });
    } catch (error) {
        sendErrorResponse(res, 500, error, 'internal_error', 'internal_error');
    }
}

/**
 * Handle Ollama-compatible ps endpoint (alias of /api/tags)
 */
export async function handleOllamaPs(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const modelNames = await getAvailableOllamaModelNames();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        sendJson(res, 200, {
            models: modelNames.map((name: string) => ({
                ...buildOllamaModelTag(name),
                expires_at: expiresAt,
                size_vram: 0,
                context_length: 8192
            }))
        });
    } catch (error) {
        sendErrorResponse(res, 500, error, 'internal_error', 'internal_error');
    }
}

/**
 * Handle Ollama-compatible show endpoint
 */
export async function handleOllamaShow(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: OllamaShowRequest = body ? JSON.parse(body) : {};
        const modelName = requestData.model || requestData.name || 'gpt-5-mini';

        sendJson(res, 200, {
            parameters: 'temperature 0.7\nnum_ctx 8192',
            license: 'See GitHub Copilot terms and model provider terms.',
            modified_at: new Date().toISOString(),
            template: '{{ .Prompt }}',
            details: buildOllamaModelDetails(),
            capabilities: ['completion'],
            model_info: {
                'general.architecture': 'copilot',
                'general.name': modelName,
                'general.parameter_count': 0,
                'general.quantization_version': 0
            }
        });
    } catch (error) {
        sendErrorResponse(res, 500, error, 'internal_error', 'internal_error');
    }
}

/**
 * Handle Ollama-compatible generate endpoint
 */
export async function handleOllamaGenerate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: OllamaGenerateRequest = JSON.parse(body);

        if (!requestData.prompt || typeof requestData.prompt !== 'string') {
            sendJson(res, 400, {
                error: {
                    message: 'prompt is required',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            });
            return;
        }

        const modelName = requestData.model || 'gpt-5-mini';
        const startedAt = process.hrtime.bigint();
        const output = await generateTextForOllama(modelName, [{ role: 'user', content: requestData.prompt }]);
        const totalDuration = Number(process.hrtime.bigint() - startedAt);
        const responsePayload = {
            model: modelName,
            created_at: new Date().toISOString(),
            response: output,
            done: true,
            done_reason: 'stop',
            total_duration: totalDuration,
            load_duration: 0,
            prompt_eval_count: estimateTokenCount(requestData.prompt),
            prompt_eval_duration: 0,
            eval_count: estimateTokenCount(output),
            eval_duration: 0
        };

        const shouldStream = requestData.stream !== false;
        if (shouldStream) {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
            res.write(`${JSON.stringify(responsePayload)}\n`);
            res.end();
            return;
        }

        sendJson(res, 200, responsePayload);
    } catch (error) {
        sendErrorResponse(res, 500, error, 'internal_error', 'internal_error');
    }
}

/**
 * Handle Ollama-compatible chat endpoint
 */
export async function handleOllamaChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: OllamaChatRequest = JSON.parse(body);

        if (!Array.isArray(requestData.messages)) {
            sendJson(res, 400, {
                error: {
                    message: 'messages is required and must be an array',
                    type: 'invalid_request_error',
                    code: 'missing_parameter'
                }
            });
            return;
        }

        const modelName = requestData.model || 'gpt-5-mini';
        const startedAt = process.hrtime.bigint();
        const output = await generateTextForOllama(modelName, requestData.messages);
        const totalDuration = Number(process.hrtime.bigint() - startedAt);
        const responsePayload = {
            model: modelName,
            created_at: new Date().toISOString(),
            message: {
                role: 'assistant',
                content: output
            },
            done: true,
            done_reason: 'stop',
            total_duration: totalDuration,
            load_duration: 0,
            prompt_eval_count: estimateTokenCount(requestData.messages.map((m) => m.content).join(' ')),
            prompt_eval_duration: 0,
            eval_count: estimateTokenCount(output),
            eval_duration: 0
        };

        const shouldStream = requestData.stream !== false;
        if (shouldStream) {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
            res.write(`${JSON.stringify(responsePayload)}\n`);
            res.end();
            return;
        }

        sendJson(res, 200, responsePayload);
    } catch (error) {
        sendErrorResponse(res, 500, error, 'internal_error', 'internal_error');
    }
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
 * Handle file add request - Add a new file to the workspace
 */
export async function handleFileAdd(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        const body = await readRequestBody(req);
        const requestData: { filePath: string; content: string; overwrite?: boolean } = JSON.parse(body);
        
        if (!requestData.filePath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'filePath is required',
                    type: 'invalid_request',
                    code: 'missing_parameter'
                }
            }));
            return;
        }
        
        if (requestData.content === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'content is required',
                    type: 'invalid_request',
                    code: 'missing_parameter'
                }
            }));
            return;
        }
        
        const result = await addFile(
            requestData.filePath,
            requestData.content,
            requestData.overwrite || false
        );
        
        if (result.success) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                filePath: result.fullPath,
                message: `File ${requestData.filePath} added successfully`
            }));
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: result.error || 'Failed to add file',
                    type: 'file_add_error',
                    code: 'file_add_error'
                }
            }));
        }
    } catch (error) {
        console.error('[Copilot Service] Error adding file:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: errorMessage,
                type: 'file_add_error',
                code: 'file_add_error'
            }
        }));
    }
}

/** * Get available model families from the subscription
 */
export async function getAvailableModelFamilies(): Promise<string[]> {
    try {
        const models = await vscode.lm.selectChatModels();
        const families = new Set<string>();
        models.forEach(model => {
            if (model.family) {
                families.add(model.family);
            }
        });
        return Array.from(families).sort();
    } catch {
        return [];
    }
}

/**
 * Get available model names for Ollama-compatible endpoints
 */
async function getAvailableOllamaModelNames(): Promise<string[]> {
    const modelFamilies = await getAvailableModelFamilies();
    return modelFamilies.length > 0 ? modelFamilies : ['gpt-5-mini'];
}

/**
 * Build Ollama model details object
 */
function buildOllamaModelDetails(): Record<string, unknown> {
    return {
        parent_model: '',
        format: 'copilot',
        family: 'copilot',
        families: ['copilot'],
        parameter_size: 'unknown',
        quantization_level: 'unknown'
    };
}

/**
 * Build Ollama model tag record
 */
function buildOllamaModelTag(name: string): Record<string, unknown> {
    return {
        name,
        model: name,
        modified_at: new Date().toISOString(),
        size: 0,
        digest: 'sha256:copilot-as-service',
        details: buildOllamaModelDetails()
    };
}

/**
 * Rough token estimation fallback for compatibility fields
 */
function estimateTokenCount(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) {
        return 0;
    }
    return Math.max(1, Math.ceil(trimmed.length / 4));
}

/**
 * Shared Ollama-compatible generation flow
 */
async function generateTextForOllama(modelName: string, messages: Array<{ role: string; content: string }>): Promise<string> {
    let models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: modelName
    });

    if (models.length === 0) {
        models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    }

    if (models.length === 0) {
        throw new Error(`Model ${modelName} is not available`);
    }

    const model = models[0];
    const chatMessages = await prepareChatMessages({
        messages,
        includeWorkspaceContext: false
    });

    const requestOptions: vscode.LanguageModelChatRequestOptions = {
        justification: 'Ollama-compatible API request via Copilot as Service'
    };

    const chatResponse = await model.sendRequest(chatMessages, requestOptions);
    return handleNonStreamingResponse(model, chatResponse, chatMessages, requestOptions);
}

/**
 * Shared JSON response helper
 */
function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

/**
 * Shared error response helper
 */
function sendErrorResponse(
    res: http.ServerResponse,
    status: number,
    error: unknown,
    type: string,
    code: string
): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, status, {
        error: {
            message: errorMessage,
            type,
            code
        }
    });
}

/** * Read request body as string
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
