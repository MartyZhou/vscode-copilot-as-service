import {
    handleOllamaChat,
    handleOllamaGenerate,
    handleOllamaPs,
    handleOllamaShow,
    handleOllamaTags,
    handleOllamaVersion
} from '../routes';
import { RouteRegistry } from '../server/routeRegistry';
import { RoutePlugin } from './routePlugin';

export class OllamaPlugin implements RoutePlugin {
    public registerRoutes(registry: RouteRegistry): void {
        registry.registerRoutes([
            { method: 'GET', path: '/api/version', handler: handleOllamaVersion },
            { method: 'GET', path: '/api/tags', handler: handleOllamaTags },
            { method: 'GET', path: '/api/ps', handler: handleOllamaPs },
            { method: 'POST', path: '/api/show', handler: handleOllamaShow },
            { method: 'POST', path: '/api/generate', handler: handleOllamaGenerate },
            { method: 'POST', path: '/api/chat', handler: handleOllamaChat }
        ]);
    }
}
