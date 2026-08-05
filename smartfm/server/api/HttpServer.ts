import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { Router } from './Router.ts';
import type { HttpMethod, RequestContext } from './Router.ts';
import { HttpError } from './HttpError.ts';
import type { ApplicationContext } from '../infrastructure/ApplicationContext.ts';
import { AuthController } from './controllers/AuthController.ts';
import { AccountController } from './controllers/AccountController.ts';
import { FleetController } from './controllers/FleetController.ts';
import { OrderController } from './controllers/OrderController.ts';
import { DispatchController } from './controllers/DispatchController.ts';
import { TrackingController } from './controllers/TrackingController.ts';
import { BillingController } from './controllers/BillingController.ts';
import { ReportController } from './controllers/ReportController.ts';

const MAX_BODY_BYTES = 512 * 1024;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

/**
 * The application server: the single entry point of the server tier.
 *
 * Responsibilities are deliberately narrow — read the request, resolve the
 * session, dispatch to a controller, serialise the result, translate any
 * `DomainError` into a status code. No business decision is made here.
 *
 * When a production bundle exists in `dist/`, the same process also serves the
 * browser client, so the whole system starts with one command. That is a
 * deployment convenience, not an architectural merge: the two tiers still speak
 * only over HTTP/JSON and are separately deployable.
 */
export class HttpServer {
  private readonly application: ApplicationContext;
  private readonly router = new Router();
  private readonly staticRoot: string;
  private server: Server | undefined;

  constructor(application: ApplicationContext, staticRoot: string) {
    this.application = application;
    this.staticRoot = staticRoot;

    const controllers = [
      new AuthController(application.services),
      new AccountController(application.services),
      new FleetController(application.services),
      new OrderController(application.services),
      new DispatchController(application.services),
      new TrackingController(application.services),
      new BillingController(application.services),
      new ReportController(application.services),
    ];
    for (const controller of controllers) {
      controller.register(this.router);
    }

    this.router.get('/api/health', async () => ({
      status: 'ok',
      time: this.application.clock.now().toISOString(),
      dataSet: await this.application.describe(),
      endpoints: this.router.describe(),
    }));
  }

  async listen(port: number): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    return new Promise((resolve) => {
      this.server?.listen(port, () => {
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server === undefined) {
        resolve();
        return;
      }
      this.server.close(() => {
        resolve();
      });
    });
  }

  routeTable(): string[] {
    return this.router.describe();
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const method = (request.method ?? 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      HttpServer.writeCorsHeaders(response);
      response.writeHead(204).end();
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      await this.serveStatic(url.pathname, response);
      return;
    }

    try {
      const body = await HttpServer.readJsonBody(request);
      const { handler, params } = this.router.resolve(method as HttpMethod, url.pathname);

      const token = HttpServer.readBearerToken(request);
      const context: RequestContext = {
        method: method as HttpMethod,
        path: url.pathname,
        params,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
        token,
        session: this.application.services.auth.resolve(token),
      };

      const result = await handler(context);
      HttpServer.writeJson(response, 200, result ?? { ok: true });
    } catch (error) {
      const status = HttpError.statusFor(error);
      if (status === 500) {
        console.error('[SmartFM] Unhandled error:', error);
      }
      HttpServer.writeJson(response, status, HttpError.bodyFor(error));
    }
  }

  /** Serves the built client, falling back to index.html so the SPA can route. */
  private async serveStatic(pathname: string, response: ServerResponse): Promise<void> {
    if (!existsSync(this.staticRoot)) {
      HttpServer.writeJson(response, 404, {
        error: {
          code: 'CLIENT_NOT_BUILT',
          message:
            'The browser client has not been built. Run `npm run dev` for development, or `npm run build` then `npm run server` to serve the production bundle from this port.',
        },
      });
      return;
    }

    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = normalize(join(this.staticRoot, requested));

    // Refuse any path that escapes the static root.
    if (!candidate.startsWith(normalize(this.staticRoot) + sep) && candidate !== normalize(this.staticRoot)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const filePath = existsSync(candidate) && extname(candidate) !== '' ? candidate : join(this.staticRoot, 'index.html');
    if (!existsSync(filePath)) {
      response.writeHead(404).end('Not found');
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    response.end(content);
  }

  private static readBearerToken(request: IncomingMessage): string | undefined {
    const header = request.headers.authorization;
    if (header === undefined || !header.toLowerCase().startsWith('bearer ')) {
      return undefined;
    }
    return header.slice(7).trim();
  }

  /** Reads and parses the request body, rejecting anything oversized or malformed. */
  private static async readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return {};
    }
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        throw new Error('Request body is too large.');
      }
      chunks.push(buffer);
    }
    if (chunks.length === 0) {
      return {};
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (raw === '') {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      throw new Error('Request body is not valid JSON.');
    }
  }

  private static writeJson(response: ServerResponse, status: number, payload: unknown): void {
    HttpServer.writeCorsHeaders(response);
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }

  /** The Vite dev server runs on a different port during development. */
  private static writeCorsHeaders(response: ServerResponse): void {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
}
