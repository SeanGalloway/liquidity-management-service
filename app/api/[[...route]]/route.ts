import { createApp } from '@server/app';
import { createContainer } from '@server/container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let app: ReturnType<typeof createApp> | undefined;

function handleRequest(request: Request) {
  app ??= createApp(createContainer());
  return app.fetch(request);
}

export const GET = handleRequest;
export const POST = handleRequest;
