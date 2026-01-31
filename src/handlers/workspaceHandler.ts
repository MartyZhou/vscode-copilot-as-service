/**
 * Workspace context and file handling utilities
 */
import * as vscode from 'vscode';

/**
 * Get workspace context information
 */
export async function getWorkspaceContext(includeContext: boolean = true): Promise<string | undefined> {
    if (!includeContext) {
        return undefined;
    }
    
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }

    const contextParts: string[] = [];
    
    // Add workspace folder info
    contextParts.push('# Workspace Context');
    contextParts.push(`Working in workspace: ${workspaceFolders[0].name}`);
    contextParts.push(`Path: ${workspaceFolders[0].uri.fsPath}`);
    
    // Add active editor info if available
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const doc = activeEditor.document;
        contextParts.push(`\n## Active File`);
        contextParts.push(`File: ${vscode.workspace.asRelativePath(doc.uri)}`);
        contextParts.push(`Language: ${doc.languageId}`);
        
        // Include active file content if it's not too large
        if (doc.lineCount < 500) {
            contextParts.push(`\n### Content`);
            contextParts.push('```' + doc.languageId);
            contextParts.push(doc.getText());
            contextParts.push('```');
        }
    }

    // Add open editors info
    const openEditors = vscode.window.visibleTextEditors;
    if (openEditors.length > 0) {
        contextParts.push(`\n## Open Editors (${openEditors.length})`);
        for (const editor of openEditors.slice(0, 5)) { // Limit to 5
            contextParts.push(`- ${vscode.workspace.asRelativePath(editor.document.uri)}`);
        }
    }

    return contextParts.join('\n');
}

/**
 * Read multiple files and format their content for context
 */
export async function readMultipleFiles(filePaths: string[]): Promise<string | undefined> {
    if (!filePaths || filePaths.length === 0) {
        return undefined;
    }
    
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    
    const contextParts: string[] = [];
    contextParts.push('# Requested Files');
    contextParts.push('');
    
    for (const filePath of filePaths) {
        try {
            // Handle both absolute and relative paths
            let fileUri: vscode.Uri;
            if (filePath.startsWith('/') || filePath.includes(':')) {
                // Absolute path
                fileUri = vscode.Uri.file(filePath);
            } else {
                // Relative path - resolve relative to workspace
                fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
            }
            
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const textContent = Buffer.from(fileContent).toString('utf8');
            const relativePath = vscode.workspace.asRelativePath(fileUri);
            
            // Detect language from file extension
            const ext = filePath.split('.').pop() || '';
            
            contextParts.push(`## ${relativePath}`);
            contextParts.push('```' + ext);
            contextParts.push(textContent);
            contextParts.push('```');
            contextParts.push('');
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            contextParts.push(`## ${filePath}`);
            contextParts.push(`Error reading file: ${errorMsg}`);
            contextParts.push('');
            console.error(`[Copilot Service] Error reading file ${filePath}:`, errorMsg);
        }
    }
    
    return contextParts.join('\n');
}

/**
 * Search for code in workspace files
 */
export async function searchWorkspaceCode(query: string, filePattern?: string, maxResults: number = 20): Promise<string | undefined> {
    if (!query) {
        return undefined;
    }
    
    try {
        const searchPattern = filePattern || '**/*';
        const exclude = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/__pycache__/**';
        
        // Find files matching the pattern (search many more files to ensure deep nested files are found)
        const searchLimit = maxResults * 100; // Increased significantly to handle deep directory structures
        const files = await vscode.workspace.findFiles(searchPattern, exclude, searchLimit);
        
        console.log(`[Copilot Service] Searching ${files.length} files for "${query}" with pattern "${searchPattern}"`);
        
        const contextParts: string[] = [];
        contextParts.push('# Code Search Results');
        contextParts.push(`Query: "${query}"`);
        if (filePattern) {
            contextParts.push(`File Pattern: ${filePattern}`);
        }
        contextParts.push('');
        
        let filesWithMatches = 0;
        const queryLower = query.toLowerCase();
        
        for (const fileUri of files) {
            if (filesWithMatches >= maxResults) {
                break;
            }
            
            try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri);
                const textContent = Buffer.from(fileContent).toString('utf8');
                const lines = textContent.split('\n');
                const relativePath = vscode.workspace.asRelativePath(fileUri);
                
                const matches: { lineNum: number; line: string }[] = [];
                lines.forEach((line, index) => {
                    if (line.toLowerCase().includes(queryLower)) {
                        matches.push({ lineNum: index + 1, line: line.trim() });
                    }
                });
                
                if (matches.length > 0) {
                    contextParts.push(`## ${relativePath}`);
                    contextParts.push(`Found ${matches.length} match(es):`);
                    contextParts.push('');
                    
                    // Limit matches per file to avoid overwhelming context
                    const limitedMatches = matches.slice(0, 10);
                    for (const match of limitedMatches) {
                        contextParts.push(`Line ${match.lineNum}: ${match.line}`);
                    }
                    
                    if (matches.length > 10) {
                        contextParts.push(`... and ${matches.length - 10} more match(es)`);
                    }
                    
                    contextParts.push('');
                    filesWithMatches++;
                }
            } catch (error) {
                // Skip files that can't be read
                continue;
            }
        }
        
        if (filesWithMatches === 0) {
            contextParts.push('No matches found.');
        }
        
        return contextParts.join('\n');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot Service] Error searching workspace:', errorMsg);
        return `Error searching workspace: ${errorMsg}`;
    }
}

/**
 * Open a file in the editor and optionally navigate to a line
 */
export async function openFileInEditor(filePath: string, line?: number): Promise<boolean> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }
        
        let fileUri: vscode.Uri;
        if (filePath.startsWith('/') || filePath.includes(':')) {
            fileUri = vscode.Uri.file(filePath);
        } else {
            fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
        }
        
        const document = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(document);
        
        if (line !== undefined && line > 0) {
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
        
        return true;
    } catch (error) {
        console.error('[Copilot Service] Error opening file:', error);
        return false;
    }
}

/**
 * Read a file's content, optionally with line range
 */
export async function readFileContent(
    filePath: string, 
    startLine?: number, 
    endLine?: number
): Promise<{ content: string; totalLines: number; language: string }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
    }
    
    let fileUri: vscode.Uri;
    if (filePath.startsWith('/') || filePath.includes(':')) {
        fileUri = vscode.Uri.file(filePath);
    } else {
        fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
    }
    
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    const textContent = Buffer.from(fileContent).toString('utf8');
    const lines = textContent.split('\n');
    const totalLines = lines.length;
    
    // Detect language from file extension
    const ext = filePath.split('.').pop() || 'txt';
    const languageMap: Record<string, string> = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'json': 'json',
        'md': 'markdown',
        'html': 'html',
        'css': 'css',
        'java': 'java',
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust',
        'cpp': 'cpp',
        'c': 'c',
        'cs': 'csharp'
    };
    const language = languageMap[ext] || ext;
    
    if (startLine !== undefined && endLine !== undefined) {
        // Return specific line range (1-indexed)
        const start = Math.max(0, startLine - 1);
        const end = Math.min(lines.length, endLine);
        return {
            content: lines.slice(start, end).join('\n'),
            totalLines,
            language
        };
    }
    
    return { content: textContent, totalLines, language };
}

/**
 * Edit a file by replacing text
 */
export async function editFile(
    filePath: string,
    replacements: Array<{ oldString: string; newString: string }>
): Promise<{ success: boolean; replacementsMade: number; errors: string[] }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
    }
    
    let fileUri: vscode.Uri;
    if (filePath.startsWith('/') || filePath.includes(':')) {
        fileUri = vscode.Uri.file(filePath);
    } else {
        fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
    }
    
    // Read current content
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    let textContent = Buffer.from(fileContent).toString('utf8');
    
    let replacementsMade = 0;
    const errors: string[] = [];
    
    for (const { oldString, newString } of replacements) {
        if (!textContent.includes(oldString)) {
            errors.push(`Could not find text to replace: "${oldString.substring(0, 50)}..."`);
            continue;
        }
        
        // Replace first occurrence only for safety
        textContent = textContent.replace(oldString, newString);
        replacementsMade++;
        console.log(`[Copilot Service] Replaced in ${filePath}: "${oldString.substring(0, 30)}..." -> "${newString.substring(0, 30)}..."`);
    }
    
    if (replacementsMade > 0) {
        // Write the modified content back
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(fileUri, encoder.encode(textContent));
        console.log(`[Copilot Service] Saved ${filePath} with ${replacementsMade} replacement(s)`);
    }
    
    return {
        success: replacementsMade > 0,
        replacementsMade,
        errors
    };
}
