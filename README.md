# VS Code Copilot as Service

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/MartyZhou.vscode-copilot-as-service?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service)
[![Install](https://img.shields.io/visual-studio-marketplace/i/MartyZhou.vscode-copilot-as-service)](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service)

**Expose GitHub Copilot as an OpenAI-compatible HTTP API server from within VS Code.**

This VS Code extension starts an HTTP server that provides programmatic access to GitHub Copilot's language models through an OpenAI-compatible REST API. Perfect for integrating Copilot into external applications, scripts, or CI/CD pipelines while leveraging your existing Copilot subscription.

## Features

- **OpenAI-Compatible API** - Drop-in replacement for OpenAI API endpoints
- **Automatic Tool Invocation** - Tools are executed automatically with results returned
- **Workspace Integration** - Include VS Code workspace context in requests
- **Code Search** - Search and read files from your workspace via API
- **File Operations** - Open files in VS Code editor from external applications
- **Streaming Support** - Server-Sent Events (SSE) for real-time responses
- **Zero Configuration** - Auto-starts with VS Code by default

## Quick Start

### Installation

**[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service)**

Or install directly from VS Code:
1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (Mac) to open Extensions
3. Search for "Copilot as Service"
4. Click Install

Alternatively, install via command line:
```bash
code --install-extension MartyZhou.vscode-copilot-as-service
```

**Requirements:**
- Active GitHub Copilot subscription
- The HTTP server starts automatically on port `8765` after installation

### Basic Usage

```python
import requests

# Simple chat completion
response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'model': 'gpt-4o-mini',
    'messages': [
        {'role': 'user', 'content': 'Hello, Copilot!'}
    ]
})

print(response.json()['choices'][0]['message']['content'])
```

### Using with OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key='not-needed',
    base_url='http://localhost:8765/v1'
)

response = client.chat.completions.create(
    model='gpt-4o-mini',
    messages=[
        {'role': 'user', 'content': 'Explain recursion in simple terms'}
    ]
)

print(response.choices[0].message.content)
```

## API Endpoints

### Chat Completions

**`POST /v1/chat/completions`**

OpenAI-compatible chat completions endpoint with extended features.

#### Basic Request

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is TypeScript?"}
  ],
  "stream": false
}
```

#### Advanced Features

```json
{
  "model": "gpt-4o-mini",
  "messages": [...],
  "stream": false,
  "includeWorkspaceContext": true,
  "fileReads": ["src/app.ts", "package.json"],
  "codeSearch": {
    "query": "function calculateTotal",
    "filePattern": "**/*.ts",
    "maxResults": 10
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          }
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

#### Extended Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeWorkspaceContext` | boolean | Include active files and workspace info (default: `true`) |
| `fileReads` | string[] | Array of file paths to read and include in context |
| `codeSearch` | object | Search workspace files for specific code patterns |
| `tools` | array | Tool definitions (executed automatically when called) |
| `tool_choice` | string/object | Control tool invocation (`auto`, `required`, `none`) |
| `response_format` | object | Force JSON response (`json_object`, `json_schema`) |

#### Response Format

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1702345678,
  "model": "gpt-4o-mini",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "TypeScript is a typed superset of JavaScript..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": -1,
    "completion_tokens": -1,
    "total_tokens": -1
  }
}
```

### Models

**`GET /v1/models`**

List all available Copilot models.

```bash
curl http://localhost:8765/v1/models
```

Response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "copilot-gpt-4o-mini",
      "object": "model",
      "created": 1702345678,
      "owned_by": "github-copilot",
      "name": "gpt-4o-mini",
      "family": "gpt-4o-mini",
      "vendor": "copilot"
    }
  ]
}
```

### Tools

**`GET /v1/tools`**

List all available VS Code tools.

```bash
curl http://localhost:8765/v1/tools
```

**`POST /v1/tools/invoke`**

Invoke a specific tool by name.

```json
{
  "tool_name": "vscode-search",
  "parameters": {
    "query": "TODO",
    "filePattern": "**/*.ts"
  }
}
```

### Workspace Operations

**`POST /v1/workspace/files/open`**

Open a file in VS Code editor.

```json
{
  "filePath": "src/app.ts",
  "line": 42
}
```

**`POST /v1/workspace/search`**

Search workspace files for code patterns.

```json
{
  "query": "async function",
  "filePattern": "**/*.ts",
  "maxResults": 20
}
```

### Health Check

**`GET /health`**

Check if the service is running.

```bash
curl http://localhost:8765/health
```

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
    'model': 'gpt-4o-mini',
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
| `copilotAsService.model` | `gpt-4o-mini` | Default model |
| `copilotAsService.autoStart` | `true` | Auto-start server on VS Code launch |
| `copilotAsService.includeWorkspaceContext` | `false` | Include workspace context by default |


## Commands

Access via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Start Copilot HTTP Server** - Start the server manually
- **Stop Copilot HTTP Server** - Stop the running server
- **Restart Copilot HTTP Server** - Restart the server (useful after config changes)

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
    'model': 'gpt-4o-mini',
    'messages': [
        {'role': 'user', 'content': 'Review these files for best practices'}
    ],
    'fileReads': ['src/main.ts', 'src/utils.ts', 'package.json']
})

# Search codebase
response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'model': 'gpt-4o-mini',
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
    'model': 'gpt-4o-mini',
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
