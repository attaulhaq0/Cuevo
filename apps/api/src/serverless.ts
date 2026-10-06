import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import { createApp } from './app';

type HttpRuntime = { app: { getHttpServer(): Server } };

/** The host supplies the socket; the existing application owns all HTTP behavior. */
export function createServerlessHandler(bootstrap: () => Promise<HttpRuntime> = createApp) {
  let application: Promise<HttpRuntime> | undefined;
  const runtime = () => application ??= Promise.resolve().then(bootstrap).catch(error => {
    application = undefined;
    throw error;
  });
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const { app } = await runtime();
      if (response.destroyed || response.writableEnded) return;
      await new Promise<void>((resolve, reject) => {
        const finished = () => { cleanup(); resolve(); };
        const failed = (error: Error) => { cleanup(); reject(error); };
        const cleanup = () => { response.off('finish', finished); response.off('close', finished); response.off('error', failed); };
        response.once('finish', finished); response.once('close', finished); response.once('error', failed);
        try { app.getHttpServer().emit('request', request, response); }
        catch (error) { cleanup(); reject(error); }
      });
    } catch {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) { response.destroy(); return; }
      const requestId = randomUUID();
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
      response.end(JSON.stringify({ code: 'API_UNAVAILABLE', message: 'School services are temporarily unavailable.', requestId }));
    }
  };
}

// Fastify retains raw parsing, body limits and validation, including upload bytes.
export const config = { api: { bodyParser: false } };
export default createServerlessHandler();
