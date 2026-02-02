# VS Code Copilot as Service

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/MartyZhou.vscode-copilot-as-service?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service)

**Expose GitHub Copilot as an OpenAI-compatible HTTP API with intelligent file operations and workflow suggestions.**

This VS Code extension provides programmatic access to GitHub Copilot through a REST API, with built-in file operations and AI-powered workflow suggestions for uninterrupted development.

## Key Features

- **OpenAI-Compatible API** - Drop-in replacement for OpenAI endpoints
- **Integrated File Operations** - Read, edit, search, and open files through chat
- **Workflow Suggestions** - AI suggests next logical actions automatically
- **Automatic Tool Invocation** - Tools execute automatically with results
- **Workspace Integration** - Include VS Code context in requests
- **Zero Configuration** - Auto-starts on port 8765

## Quick Start

### Installation

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service) or:

```bash
code --install-extension MartyZhou.vscode-copilot-as-service
```

**Requirements:** Active GitHub Copilot subscription

### Basic Usage

```python
import requests

# Chat with file operations
response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'messages': [{'role': 'user', 'content': 'Explain this file'}],
    'fileOperation': {'type': 'read', 'filePath': 'src/extension.ts'},
    'suggestNextActions': True  # Get workflow suggestions
})

result = response.json()
print(result['choices'][0]['message']['content'])

# Execute suggested next action
if 'suggested_actions' in result:
    next_action = result['suggested_actions'][0]
    print(f"Suggested: {next_action['description']}")
```

## Key Capabilities

### 1. File Operations

Perform file operations directly through chat:

```python
# Read file
{'fileOperation': {'type': 'read', 'filePath': 'src/file.ts'}}

# Search workspace
{'fileOperation': {'type': 'search', 'query': 'error handling'}}

# Edit file
{'fileOperation': {'type': 'edit', 'filePath': 'config.json', 
                   'oldString': 'old', 'newString': 'new'}}

# Open in editor
{'fileOperation': {'type': 'open', 'filePath': 'README.md', 'line': 42}}
```

### 2. Workflow Suggestions

Get AI-powered suggestions for next actions:

```python
response = requests.post(url, json={
    'messages': [{'role': 'user', 'content': 'Analyze this'}],
    'fileOperation': {'type': 'read', 'filePath': 'src/extension.ts'},
    'suggestNextActions': True
})

# Response includes suggested_actions array
for action in response.json()['suggested_actions']:
    print(f"- {action['description']}: {action['reasoning']}")
    # Each action has a ready-to-use 'request' object
```

### 3. Automated Workflows

Chain suggestions for automated exploration:

```python
def auto_workflow(initial_request, steps=5):
    request = initial_request
    for _ in range(steps):
        result = requests.post(url, json=request).json()
        print(result['choices'][0]['message']['content'][:100])
        if 'suggested_actions' not in result:
            break
        request = result['suggested_actions'][0]['request']
    return result
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | Main chat endpoint with file operations & suggestions |
| `GET /v1/models` | List available models |
| `GET /health` | Health check |
| `POST /v1/workspace/files/read` | Read file (dedicated endpoint) |
| `POST /v1/workspace/files/search` | Search workspace (dedicated endpoint) |

See [Complete Guide](docs/COMPLETE_GUIDE.md) for full API reference.

## Testing

Run comprehensive integration tests:

```bash
cd vscode-copilot-as-service
python tests/run_all_tests.py
```

Tests verify all endpoints, file operations, workflow suggestions, and error handling.

## Configuration

Configure in VS Code settings (`Ctrl+,`):

```json
{
  "copilotAsService.port": 8765,
  "copilotAsService.model": "gpt-5-mini",
  "copilotAsService.autoStart": true
}
```

Available models are fetched dynamically from your GitHub Copilot subscription. Use the `GET /v1/models` endpoint or the "Select Copilot Model from Subscription" command to view available model families.

## Examples

### Code Review Workflow

```python
# 1. Read and analyze
r1 = requests.post(url, json={
    'messages': [{'role': 'user', 'content': 'Review for issues'}],
    'fileOperation': {'type': 'read', 'filePath': 'src/routes.ts'},
    'suggestNextActions': True
}).json()

# 2. Follow "Search for related files" suggestion
r2 = requests.post(url, json=r1['suggested_actions'][1]['request']).json()

# 3. Continue with next suggestions...
```

### Bug Investigation

```python
# Search for error -> Read file -> Analyze -> Fix
def investigate(error_msg):
    r = requests.post(url, json={
        'messages': [{'role': 'user', 'content': f'Find: {error_msg}'}],
        'fileOperation': {'type': 'search', 'query': error_msg},
        'suggestNextActions': True
    }).json()
    
    # Auto-execute "Read most relevant file" suggestion
    analysis = requests.post(url, 
        json=r['suggested_actions'][0]['request']).json()
    
    return analysis['choices'][0]['message']['content']
```

## Use Cases

- **Code Analysis**: Analyze files with AI and get suggested next steps
- **Automated Review**: Build code review bots that follow suggestions
- **Documentation**: Generate docs by exploring codebases automatically  
- **Bug Investigation**: Search, analyze, and trace issues systematically
- **Learning Tool**: Explore unfamiliar codebases with AI guidance
- **CI/CD Integration**: Integrate Copilot into automated pipelines

## Contributing

Issues and PRs welcome! [GitHub Repository](https://github.com/MartyZhou/vscode-copilot-as-service)

## License

MIT

---


## Tool Invocation

Tools are automatically invoked when requested by the model. The extension handles:

1. Tool call detection in model responses
2. Automatic tool execution
3. Result forwarding to the model
4. Final response generation

**Important:** Streaming is automatically disabled when tools are provided.

### Example with Tools

```python
import requests

response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'model': 'gpt-5-mini',
    'messages': [
        {'role': 'user', 'content': 'Search the codebase for authentication functions'}
    ],
    'tools': ['vscode-search'],  # Tool name reference
    'tool_choice': 'auto'
})

# The extension automatically:
# 1. Detects tool call request from model
# 2. Invokes vscode-search tool
# 3. Sends results back to model
# 4. Returns final answer
print(response.json()['choices'][0]['message']['content'])
```

## Configuration

Open VS Code Settings and search for "Copilot as Service":

| Setting | Default | Description |
|---------|---------|-------------|
| `copilotAsService.port` | `8765` | HTTP server port |
| `copilotAsService.model` | `gpt-5-mini` | Default model (dynamically loaded from your subscription) |
| `copilotAsService.autoStart` | `true` | Auto-start server on VS Code launch |
| `copilotAsService.includeWorkspaceContext` | `false` | Include workspace context by default |

**Note**: The available models are automatically fetched from your GitHub Copilot subscription. The model setting accepts any model family available in your subscription. Use the `/v1/models` endpoint to get the list of available models.


## Commands

Access via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Start Copilot HTTP Server** - Start the server manually
- **Stop Copilot HTTP Server** - Stop the running server
- **Restart Copilot HTTP Server** - Restart the server (useful after config changes)
- **Select Copilot Model from Subscription** - Show a dropdown menu of available models from your GitHub Copilot subscription and update the setting

The status bar shows the current server state and port. Click to restart.

## Examples

### Python Client

```python
from python_client import chat_completion, list_models, invoke_tool

# Simple chat
response = chat_completion([
    {'role': 'user', 'content': 'Explain async/await'}
])
print(response)

# With workspace context
response = chat_completion(
    [{'role': 'user', 'content': 'Analyze this codebase'}],
    include_workspace_context=True
)

# With tools
response = chat_completion(
    [{'role': 'user', 'content': 'Find all TODO comments'}],
    tools=['vscode-search']
)

# Stream response
chat_completion(
    [{'role': 'user', 'content': 'Write a short story'}],
    stream=True
)
```

### Workspace Integration

```python
# Read specific files
response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'model': 'gpt-5-mini',
    'messages': [
        {'role': 'user', 'content': 'Review these files for best practices'}
    ],
    'fileReads': ['src/main.ts', 'src/utils.ts', 'package.json']
})

# Search codebase
response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'model': 'gpt-5-mini',
    'messages': [
        {'role': 'user', 'content': 'Where are the database queries?'}
    ],
    'codeSearch': {
        'query': 'SELECT',
        'filePattern': '**/*.{ts,js,sql}',
        'maxResults': 20
    }
})
```

### JSON Response Format

```python
response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'model': 'gpt-5-mini',
    'messages': [
        {'role': 'user', 'content': 'List 3 programming languages with their years'}
    ],
    'response_format': {
        'type': 'json_object'
    }
})

# Response will be valid JSON
data = response.json()['choices'][0]['message']['content']
parsed = json.loads(data)
```

## Use Cases

### Automated Test Fixing with selenium-selector-autocorrect

The **[selenium-selector-autocorrect](https://pypi.org/project/selenium-selector-autocorrect/)** package uses this extension to automatically fix broken Selenium test selectors when they fail. When a WebDriverWait times out, it:

1. Captures page context and failed selector
2. Sends request to the local Copilot API
3. Receives AI-suggested alternative selectors
4. Tests the new selector automatically
5. Optionally updates test files with corrections

**Installation:**
```bash
pip install selenium-selector-autocorrect
code --install-extension MartyZhou.vscode-copilot-as-service
```

**Usage:**
```python
from selenium import webdriver
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium_selector_autocorrect.wait_hook import install_auto_correct_hook

# Enable auto-correction with local Copilot service
install_auto_correct_hook()

driver = webdriver.Chrome()
driver.get("https://example.com")

# If selector fails, AI suggests alternatives automatically
element = WebDriverWait(driver, 10).until(
    EC.presence_of_element_located((By.ID, "old-element-id"))
)
```

This integration demonstrates how the local Copilot API can enhance development workflows by providing intelligent assistance when automated processes encounter issues.

## Architecture

The extension is organized into modular components:

```
src/
├── extension.ts              # Extension lifecycle & HTTP server
├── types.ts                  # TypeScript type definitions
├── routes.ts                 # HTTP endpoint handlers
└── handlers/
    ├── responseHandler.ts    # Response & tool invocation
    ├── toolHandler.ts        # Tool preparation & mapping
    ├── messageHandler.ts     # Message formatting
    └── workspaceHandler.ts   # Workspace & file operations
```

### Request Flow

1. HTTP request received by server in `extension.ts`
2. Route handler in `routes.ts` processes request
3. Message preparation in `messageHandler.ts` formats context
4. Tool preparation in `toolHandler.ts` converts tool definitions
5. Language model request via VS Code API
6. Response processing in `responseHandler.ts` handles streaming/tools
7. Tool invocation (if needed) executes and collects results
8. HTTP response sent back to client

## Security Considerations

- **Local Only**: Server binds to `localhost` by default (not exposed externally)
- **No Authentication**: Assumes trusted local environment
- **Copilot Subscription**: Requires valid GitHub Copilot subscription
- **Rate Limits**: Subject to GitHub Copilot's rate limits
- **Workspace Access**: API can access all files in open workspace


## Troubleshooting

### Server Won't Start

1. Check if port `8765` is already in use
2. Change port in settings: `copilotAsService.port`
3. Verify GitHub Copilot is active: Check status bar
4. Restart VS Code

### Model Not Available

Ensure your GitHub Copilot subscription includes the requested model. Use `/v1/models` to see available models.

### Tool Invocation Errors

- Verify tool exists: `GET /v1/tools`
- Check tool parameters match schema
- Review VS Code Developer Console for errors: `Help > Toggle Developer Tools`

### Workspace Context Empty

- Ensure a folder is open in VS Code
- Check `includeWorkspaceContext` is `true`
- Verify files are accessible (not binary/too large)

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development Setup

```bash
# Clone repository
git clone https://github.com/MartyZhou/vscode-copilot-as-service.git
cd vscode-copilot-as-service

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run linter
npm run lint

# Watch mode for development
npm run watch

# Package extension
npm run pack
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on top of the [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- Inspired by the need to integrate GitHub Copilot with external tools and workflows
- Thanks to the VS Code and GitHub Copilot teams for their excellent APIs

## Support

- **Issues**: [GitHub Issues](https://github.com/MartyZhou/vscode-copilot-as-service/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MartyZhou/vscode-copilot-as-service/discussions)

---

**Note**: This extension requires an active GitHub Copilot subscription. It is not affiliated with or endorsed by GitHub or Microsoft.
