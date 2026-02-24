import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

const BASE_URL = process.env.COPILOT_SERVICE_BASE_URL || 'http://localhost:8765';
const REQUEST_TIMEOUT_MS = 120_000;

async function requestJson(method, route, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${BASE_URL}${route}`, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: payload === undefined ? undefined : JSON.stringify(payload),
            signal: controller.signal
        });

        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        return { response, body, contentType };
    } finally {
        clearTimeout(timeout);
    }
}

async function getTools() {
    const { response, body } = await requestJson('GET', '/v1/tools');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.data));
    return body.data;
}

async function getToolNameContains(partialName) {
    const tools = await getTools();
    const found = tools.find((tool) => String(tool.name || '').toLowerCase().includes(partialName.toLowerCase()));
    assert.ok(found, `Expected tool containing name '${partialName}'`);
    return found.name;
}

async function getFileSearchToolName() {
    const tools = await getTools();
    const candidates = [
        'fileSearch',
        'copilot_fileSearch',
        'copilot_findFiles',
        'findFiles'
    ].map((value) => value.toLowerCase());

    const exactMatch = tools.find((tool) => candidates.includes(String(tool.name || '').toLowerCase()));
    if (exactMatch) {
        return exactMatch.name;
    }

    const containsMatch = tools.find((tool) => {
        const name = String(tool.name || '').toLowerCase();
        return name.includes('filesearch') || name.includes('findfiles');
    });

    assert.ok(containsMatch, 'Expected a VS Code built-in fileSearch/findFiles tool to be available');
    return containsMatch.name;
}

test('health endpoint', async () => {
    const { response, body } = await requestJson('GET', '/health');
    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
});

test('models endpoint', async () => {
    const { response, body } = await requestJson('GET', '/v1/models');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.data));
});

test('chat completion basic request', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        messages: [{ role: 'user', content: 'Reply with READY only.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
    assert.equal(typeof body.choices[0].message.content, 'string');
});

test('chat completion model-not-available branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        model: 'model-that-does-not-exist-12345',
        messages: [{ role: 'user', content: 'hello' }]
    });

    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'model_not_available');
});

test('chat completion streaming branch', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stream: true,
                messages: [{ role: 'user', content: 'Say hello in one short sentence.' }]
            }),
            signal: controller.signal
        });

        const text = await response.text();
        assert.equal(response.status, 200);
        assert.ok((response.headers.get('content-type') || '').includes('text/event-stream'));
        assert.ok(text.includes('[DONE]'));
    } finally {
        clearTimeout(timeout);
    }
});

test('chat completion tools with stream forces non-stream and uses fileSearch', async () => {
    const fileSearchToolName = await getFileSearchToolName();

    const { response, body, contentType } = await requestJson('POST', '/v1/chat/completions', {
        stream: true,
        tool_choice: 'required',
        tools: [fileSearchToolName],
        messages: [{ role: 'user', content: 'Find where route handlers are defined in this workspace.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(contentType.includes('application/json'));
    assert.equal(body.object, 'chat.completion');
    assert.ok(Array.isArray(body.choices));
});

test('chat completion tool_choice object branch with fileSearch', async () => {
    const fileSearchToolName = await getFileSearchToolName();

    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        tools: [
            {
                type: 'function',
                function: {
                    name: fileSearchToolName,
                    description: 'Search files in workspace',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' },
                            includePattern: { type: 'string' }
                        },
                        required: ['query']
                    }
                }
            }
        ],
        tool_choice: {
            type: 'function',
            function: { name: fileSearchToolName }
        },
        messages: [{ role: 'user', content: 'Search for extension activation logic.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion includeWorkspaceContext false branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        includeWorkspaceContext: false,
        messages: [{ role: 'user', content: 'Say context disabled.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion includeWorkspaceContext true branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        includeWorkspaceContext: true,
        messages: [{ role: 'user', content: 'Say context enabled.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion response_format branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: 'Return a json object with key status.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion fileReads branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        fileReads: ['README.md'],
        messages: [{ role: 'user', content: 'Summarize read file.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion codeSearch branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        codeSearch: {
            query: 'handleChatCompletions',
            maxResults: 3
        },
        messages: [{ role: 'user', content: 'Summarize search results.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion suggestNextActions branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        suggestNextActions: true,
        fileOperation: {
            type: 'read',
            filePath: 'README.md',
            startLine: 1,
            endLine: 20
        },
        messages: [{ role: 'user', content: 'Review and suggest next step.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('workspace endpoints add/read/edit/search/open', async () => {
    const tempFilePath = `tests/integration_tmp_${Date.now()}.txt`;
    const initialContent = 'alpha line\nbeta line\ngamma line\n';

    const addResult = await requestJson('POST', '/v1/workspace/files/add', {
        filePath: tempFilePath,
        content: initialContent,
        overwrite: true
    });
    assert.equal(addResult.response.status, 200);
    assert.equal(addResult.body.success, true);

    const readResult = await requestJson('POST', '/v1/workspace/files/read', {
        filePath: tempFilePath
    });
    assert.equal(readResult.response.status, 200);
    assert.ok(String(readResult.body.content).includes('beta line'));

    const editResult = await requestJson('POST', '/v1/workspace/files/edit', {
        filePath: tempFilePath,
        oldString: 'beta line',
        newString: 'beta line updated'
    });
    assert.ok([200, 400].includes(editResult.response.status));

    const verifyResult = await requestJson('POST', '/v1/workspace/files/read', {
        filePath: tempFilePath
    });
    assert.equal(verifyResult.response.status, 200);
    assert.ok(String(verifyResult.body.content).includes('beta line updated'));

    const searchResult = await requestJson('POST', '/v1/workspace/files/search', {
        query: 'beta line updated',
        maxResults: 5
    });
    assert.equal(searchResult.response.status, 200);
    assert.equal(searchResult.body.success, true);

    const openResult = await requestJson('POST', '/v1/workspace/files/open', {
        filePath: tempFilePath,
        line: 2
    });
    assert.equal(openResult.response.status, 200);
    assert.equal(openResult.body.success, true);
});

test('chat completion fileOperation read branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        fileOperation: {
            type: 'read',
            filePath: 'README.md',
            startLine: 1,
            endLine: 20
        },
        messages: [{ role: 'user', content: 'Summarize the file section.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion fileOperation edit branch', async () => {
    const tempFilePath = `tests/integration_edit_${Date.now()}.txt`;
    await requestJson('POST', '/v1/workspace/files/add', {
        filePath: tempFilePath,
        content: 'before edit\n',
        overwrite: true
    });

    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        fileOperation: {
            type: 'edit',
            filePath: tempFilePath,
            oldString: 'before edit',
            newString: 'after edit'
        },
        messages: [{ role: 'user', content: 'Apply this edit.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion fileOperation open branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        fileOperation: {
            type: 'open',
            filePath: 'README.md',
            line: 1
        },
        messages: [{ role: 'user', content: 'Open this file.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion fileOperation search branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        fileOperation: {
            type: 'search',
            query: 'Copilot',
            maxResults: 3
        },
        messages: [{ role: 'user', content: 'Search for Copilot references.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('chat completion fileOperation error branch', async () => {
    const { response, body } = await requestJson('POST', '/v1/chat/completions', {
        fileOperation: {
            type: 'read',
            filePath: 'this_file_should_not_exist_12345.txt'
        },
        messages: [{ role: 'user', content: 'Try reading nonexistent file and explain.' }]
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.choices));
});

test('tools invoke endpoint using readFile', async () => {
    const readFileToolName = await getToolNameContains('readfile');
    const absoluteReadmePath = path.resolve('README.md');

    const { response, body } = await requestJson('POST', '/v1/tools/invoke', {
        tool_name: readFileToolName,
        parameters: {
            filePath: absoluteReadmePath,
            startLine: 1,
            endLine: 10
        }
    });

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(typeof body.result, 'string');
});

test('ollama compatible endpoints', async () => {
    const version = await requestJson('GET', '/api/version');
    assert.equal(version.response.status, 200);
    assert.equal(typeof version.body.version, 'string');

    const tags = await requestJson('GET', '/api/tags');
    assert.equal(tags.response.status, 200);
    assert.ok(Array.isArray(tags.body.models));

    const ps = await requestJson('GET', '/api/ps');
    assert.equal(ps.response.status, 200);
    assert.ok(Array.isArray(ps.body.models));

    const show = await requestJson('POST', '/api/show', { model: 'gpt-5-mini' });
    assert.equal(show.response.status, 200);
    assert.equal(typeof show.body.details, 'object');

    const generate = await requestJson('POST', '/api/generate', {
        model: 'gpt-5-mini',
        prompt: 'Say hi in one sentence.',
        stream: false
    });
    assert.equal(generate.response.status, 200);
    assert.equal(typeof generate.body.response, 'string');

    const chat = await requestJson('POST', '/api/chat', {
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'Reply with OK only.' }],
        stream: false
    });
    assert.equal(chat.response.status, 200);
    assert.equal(typeof chat.body.message.content, 'string');
});

test('ollama generate streaming ndjson branch', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-5-mini',
                prompt: 'stream test',
                stream: true
            }),
            signal: controller.signal
        });

        const text = await response.text();
        assert.equal(response.status, 200);
        assert.ok((response.headers.get('content-type') || '').includes('application/x-ndjson'));

        const firstLine = text.split('\n').find((line) => line.trim().length > 0);
        assert.ok(firstLine);
        const payload = JSON.parse(firstLine);
        assert.equal(payload.done, true);
    } finally {
        clearTimeout(timeout);
    }
});
