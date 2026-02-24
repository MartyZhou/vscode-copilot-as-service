import * as http from 'http';

export type HttpRouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> | void;

export interface HttpRouteDefinition {
    method: string;
    path: string;
    handler: HttpRouteHandler;
}

export class RouteRegistry {
    private readonly routes: Map<string, HttpRouteHandler> = new Map<string, HttpRouteHandler>();

    public registerRoute(definition: HttpRouteDefinition): void {
        const key = this.buildKey(definition.method, definition.path);
        this.routes.set(key, definition.handler);
    }

    public registerRoutes(definitions: HttpRouteDefinition[]): void {
        for (const definition of definitions) {
            this.registerRoute(definition);
        }
    }

    public async dispatch(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const method = (req.method || '').toUpperCase();
        const requestPath = this.getRequestPath(req.url);
        const key = this.buildKey(method, requestPath);
        const handler = this.routes.get(key);

        if (!handler) {
            return false;
        }

        await handler(req, res);
        return true;
    }

    private buildKey(method: string, routePath: string): string {
        return `${method.toUpperCase()} ${routePath}`;
    }

    private getRequestPath(rawUrl: string | undefined): string {
        if (!rawUrl) {
            return '';
        }

        return new URL(rawUrl, 'http://localhost').pathname;
    }
}
