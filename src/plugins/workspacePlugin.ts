import { handleFileAdd, handleFileEdit, handleFileOpen, handleFileRead, handleWorkspaceSearch } from '../routes';
import { RouteRegistry } from '../server/routeRegistry';
import { RoutePlugin } from './routePlugin';

export class WorkspacePlugin implements RoutePlugin {
    public registerRoutes(registry: RouteRegistry): void {
        registry.registerRoutes([
            { method: 'POST', path: '/v1/workspace/files/open', handler: handleFileOpen },
            { method: 'POST', path: '/v1/workspace/files/add', handler: handleFileAdd },
            { method: 'POST', path: '/v1/workspace/files/search', handler: handleWorkspaceSearch },
            { method: 'POST', path: '/v1/workspace/files/edit', handler: handleFileEdit },
            { method: 'POST', path: '/v1/workspace/files/read', handler: handleFileRead }
        ]);
    }
}
