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
- **Ollama subset APIs** - Integrate with tools like langflow or OpenClaw as a local ollama server

## Quick Start

### Installation

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service)

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
