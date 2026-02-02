/**
 * Type definitions for the VS Code Copilot as Service extension
 */

export interface ChatCompletionRequest {
    model?: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    includeWorkspaceContext?: boolean;
    tools?: Array<OpenAITool | string>;
    tool_choice?: string | { type: string; function: { name: string } };
    response_format?: { type: string; json_schema?: unknown };
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    fileReads?: string[];
    codeSearch?: {
        query: string;
        filePattern?: string;
        maxResults?: number;
    };
    justification?: string;
    // File operations
    fileOperation?: {
        type: 'read' | 'edit' | 'open' | 'search';
        filePath?: string;
        line?: number;
        startLine?: number;
        endLine?: number;
        oldString?: string;
        newString?: string;
        replacements?: Array<{
            oldString: string;
            newString: string;
        }>;
        query?: string;
        filePattern?: string;
        maxResults?: number;
    };
    // Workflow enhancement
    suggestNextActions?: boolean;
}

export interface SuggestedAction {
    description: string;
    reasoning: string;
    request: ChatCompletionRequest;
}

export interface OpenAITool {
    type: string;
    function?: {
        name: string;
        description?: string;
        parameters?: unknown;
    };
    name?: string;
}

export interface ToolInvokeRequest {
    tool_name?: string;
    name?: string;
    parameters?: Record<string, unknown>;
    arguments?: Record<string, unknown>;
    toolInvocationToken?: string;
}

export interface FileOpenRequest {
    filePath?: string;
    path?: string;
    line?: number;
}

export interface WorkspaceSearchRequest {
    query: string;
    filePattern?: string;
    maxResults?: number;
}

export interface FileEditRequest {
    filePath: string;
    oldString?: string;
    newString?: string;
    replacements?: Array<{
        oldString: string;
        newString: string;
    }>;
}

export interface FileReadRequest {
    filePath: string;
    startLine?: number;
    endLine?: number;
}

export interface FileReadRequest {
    filePath: string;
    startLine?: number;
    endLine?: number;
}
