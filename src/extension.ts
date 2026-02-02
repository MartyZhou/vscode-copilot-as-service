import * as vscode from 'vscode';
import * as http from 'http';
import {
    handleChatCompletions,
    handleModels,
    handleToolsList,
    handleToolInvoke,
    handleFileOpen,
    handleWorkspaceSearch,
    handleHealth,
    handleFileEdit,
    handleFileRead,
    handleFileAdd,
    getAvailableModelFamilies
} from './routes';

let server: http.Server | undefined;
let statusBarItem: vscode.StatusBarItem;

/**
 * Command to select model from user's subscription
 */
async function selectModelCommand(): Promise<void> {
    try {
        const models = await getAvailableModelFamilies();
        
        if (models.length === 0) {
            vscode.window.showErrorMessage(
                'No models available. Make sure GitHub Copilot is enabled and you have an active subscription.'
            );
            return;
        }

        const currentConfig = vscode.workspace.getConfiguration('copilotAsService');
        const currentModel = currentConfig.get<string>('model', 'gpt-5-mini');

        const quickPickItems = models.map(model => ({
            label: model,
            description: model === currentModel ? '(Currently selected)' : '',
            picked: model === currentModel
        }));

        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a model from your GitHub Copilot subscription',
            matchOnDescription: true
        });

        if (selected) {
            await currentConfig.update('model', selected.label, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
                `Copilot model set to: ${selected.label}. Restart the server to apply changes.`,
                'Restart'
            ).then((action: string | undefined) => {
                if (action === 'Restart') {
                    vscode.commands.executeCommand('vscode-copilot-as-service.restart');
                }
            });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to fetch available models: ${errorMessage}`);
    }
}

export function activate(context: vscode.ExtensionContext): void {
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'vscode-copilot-as-service.restart';
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-copilot-as-service.start', () => startServer())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-copilot-as-service.stop', () => stopServer())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-copilot-as-service.restart', () => {
            stopServer();
            startServer();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-copilot-as-service.selectModel', async () => {
            await selectModelCommand();
        })
    );

    // Auto-start if enabled
    const config = vscode.workspace.getConfiguration('copilotAsService');
    if (config.get<boolean>('autoStart', true)) {
        startServer();
    }

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('copilotAsService.port') || 
                e.affectsConfiguration('copilotAsService.model')) {
                vscode.window.showInformationMessage(
                    'Copilot service settings changed. Restart the server to apply changes.',
                    'Restart'
                ).then((selection: string | undefined) => {
                    if (selection === 'Restart') {
                        vscode.commands.executeCommand('vscode-copilot-as-service.restart');
                    }
                });
            }
        })
    );
}

export function deactivate(): void {
    stopServer();
}

function startServer(): void {
    if (server) {
        vscode.window.showWarningMessage('Copilot HTTP server is already running');
        return;
    }

    const config = vscode.workspace.getConfiguration('copilotAsService');
    const port = config.get<number>('port', 8765);

    server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'POST' && req.url === '/v1/chat/completions') {
            await handleChatCompletions(req, res);
        } else if (req.method === 'GET' && req.url === '/v1/models') {
            await handleModels(req, res);
        } else if (req.method === 'GET' && req.url === '/health') {
            handleHealth(req, res);
        } else if (req.method === 'GET' && req.url === '/v1/tools') {
            await handleToolsList(req, res);
        } else if (req.method === 'POST' && req.url === '/v1/tools/invoke') {
            await handleToolInvoke(req, res);
        } else if (req.method === 'POST' && req.url === '/v1/workspace/files/open') {
            await handleFileOpen(req, res);
        } else if (req.method === 'POST' && req.url === '/v1/workspace/files/add') {
            await handleFileAdd(req, res);
        } else if (req.method === 'POST' && req.url === '/v1/workspace/files/search') {
            await handleWorkspaceSearch(req, res);
        } else if (req.method === 'POST' && req.url === '/v1/workspace/files/edit') {
            await handleFileEdit(req, res);
        } else if (req.method === 'POST' && req.url === '/v1/workspace/files/read') {
            await handleFileRead(req, res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    server.listen(port, 'localhost', () => {
        vscode.window.showInformationMessage(`Copilot HTTP server started on http://localhost:${port}`);
        updateStatusBar(port, true);
    });

    server.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'EADDRINUSE') {
            vscode.window.showErrorMessage(`Port ${port} is already in use. Please choose a different port in settings.`);
        } else {
            vscode.window.showErrorMessage(`Failed to start server: ${error.message}`);
        }
        server = undefined;
        updateStatusBar(port, false);
    });
}

function stopServer(): void {
    if (server) {
        server.close(() => {
            vscode.window.showInformationMessage('Copilot HTTP server stopped');
        });
        server = undefined;
        const config = vscode.workspace.getConfiguration('copilotAsService');
        const port = config.get<number>('port', 8765);
        updateStatusBar(port, false);
    }
}

function updateStatusBar(port: number, running: boolean): void {
    if (running) {
        statusBarItem.text = `$(globe) Copilot:${port}`;
        statusBarItem.tooltip = `Copilot HTTP server running on port ${port}\nClick to restart`;
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = `$(debug-disconnect) Copilot:Stopped`;
        statusBarItem.tooltip = 'Copilot HTTP server is stopped\nClick to start';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    statusBarItem.show();
}
