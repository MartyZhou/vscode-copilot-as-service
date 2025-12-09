/**
 * Response handling utilities for streaming and non-streaming responses
 */
import * as vscode from 'vscode';
import * as http from 'http';

/**
 * Handle streaming response - sends incremental text fragments via SSE
 */
export async function handleStreamingResponse(
    res: http.ServerResponse,
    chatResponse: vscode.LanguageModelChatResponse,
    modelToUse: string
): Promise<void> {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    for await (const fragment of chatResponse.text) {
        const streamData = {
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelToUse,
            choices: [{
                index: 0,
                delta: {
                    content: fragment
                },
                finish_reason: null
            }]
        };
        res.write(`data: ${JSON.stringify(streamData)}\n\n`);
    }

    // Send final chunk
    const finalData = {
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelToUse,
        choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
        }]
    };
    res.write(`data: ${JSON.stringify(finalData)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}

/**
 * Handle non-streaming response with automatic tool invocation
 */
export async function handleNonStreamingResponse(
    model: vscode.LanguageModelChat,
    chatResponse: vscode.LanguageModelChatResponse,
    chatMessages: vscode.LanguageModelChatMessage[],
    requestOptions: vscode.LanguageModelChatRequestOptions
): Promise<string> {
    // Collect text and tool call parts from the response
    const textParts: string[] = [];
    const toolCallParts: vscode.LanguageModelToolCallPart[] = [];
    
    for await (const part of chatResponse.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
            textParts.push(part.value);
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
            toolCallParts.push(part);
            console.log('[Copilot Service] Tool call requested:', part.name, 'with input:', JSON.stringify(part.input));
        }
    }
    
    let fullText = textParts.join('');
    
    // If there are tool calls, invoke them and get the final response
    if (toolCallParts.length > 0) {
        fullText = await processToolCalls(model, toolCallParts, chatMessages, requestOptions);
    }
    
    return fullText;
}

/**
 * Process tool calls by invoking them and getting the final response
 */
async function processToolCalls(
    model: vscode.LanguageModelChat,
    toolCallParts: vscode.LanguageModelToolCallPart[],
    chatMessages: vscode.LanguageModelChatMessage[],
    requestOptions: vscode.LanguageModelChatRequestOptions
): Promise<string> {
    console.log('[Copilot Service] Invoking', toolCallParts.length, 'tool(s)...');
    
    // Create assistant message with tool calls
    const assistantToolCallMessage = vscode.LanguageModelChatMessage.Assistant(
        toolCallParts.map(tc => tc)
    );
    
    // Invoke each tool and collect results
    const toolResultParts: vscode.LanguageModelToolResultPart[] = [];
    for (const toolCall of toolCallParts) {
        const result = await invokeToolSafely(toolCall);
        toolResultParts.push(result);
    }
    
    // Create user message with tool results
    const userToolResultMessage = vscode.LanguageModelChatMessage.User(toolResultParts);
    
    // Send follow-up request with tool results
    const followUpMessages = [...chatMessages, assistantToolCallMessage, userToolResultMessage];
    const followUpResponse = await model.sendRequest(followUpMessages, requestOptions);
    
    // Collect the final response
    let fullText = '';
    for await (const fragment of followUpResponse.text) {
        fullText += fragment;
    }
    
    console.log('[Copilot Service] Final response after tool invocation:', fullText.substring(0, 200));
    return fullText;
}

/**
 * Invoke a tool safely with error handling
 */
async function invokeToolSafely(toolCall: vscode.LanguageModelToolCallPart): Promise<vscode.LanguageModelToolResultPart> {
    try {
        const toolResult = await vscode.lm.invokeTool(
            toolCall.name,
            { input: toolCall.input, toolInvocationToken: undefined },
            new vscode.CancellationTokenSource().token
        );
        
        console.log('[Copilot Service] Tool', toolCall.name, 'invoked successfully');
        return new vscode.LanguageModelToolResultPart(toolCall.callId, toolResult.content);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot Service] Tool invocation error:', errorMsg);
        return new vscode.LanguageModelToolResultPart(
            toolCall.callId,
            [new vscode.LanguageModelTextPart(`Error invoking tool: ${errorMsg}`)]
        );
    }
}
