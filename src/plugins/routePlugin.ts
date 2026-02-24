import { RouteRegistry } from '../server/routeRegistry';

export interface RoutePlugin {
    registerRoutes(registry: RouteRegistry): void;
}
