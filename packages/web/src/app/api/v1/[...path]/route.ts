import { proxy } from "@/lib/server/proxy";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, (await context.params).path);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
