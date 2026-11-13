import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export class HttpFailure extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function checkMutation(request: Request) {
  const origin = request.headers.get("origin");
  const expected = configuredOrigin(request);
  if (origin !== expected || request.headers.get("x-menuflow-request") !== "1") {
    throw new HttpFailure(403, "Refresh this page and try again from the restaurant site.");
  }
}

export function configuredOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (configured) return new URL(configured).origin;
  if (process.env.VERCEL_URL) return "https://" + process.env.VERCEL_URL;
  if (process.env.NODE_ENV === "production") throw new HttpFailure(503, "The site origin has not been configured.");
  return new URL(request.url).origin;
}

export async function boundedBody(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum) throw new HttpFailure(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpFailure(400, "A request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maximum) {
      await reader.cancel();
      throw new HttpFailure(413, "Request is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readObject(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw new HttpFailure(415, "Send a JSON request.");
  }
  const bytes = await boundedBody(request, 128 * 1024);
  try {
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new HttpFailure(400, "Invalid JSON object."); }
}

export function uuid(value: unknown) {
  if (typeof value !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) {
    throw new HttpFailure(400, "Invalid identifier.");
  }
  return value;
}

export function databaseFailure(error: { code?: string; message: string }) {
  const code = error.code;
  if (code === "42501") return new HttpFailure(403, "You do not have permission for that action.");
  if (code === "23505" || code === "23503" || code === "40001" || code === "40P01")
    return new HttpFailure(409, "The data changed or is already in use. Refresh and try again.");
  if (code === "P0002") return new HttpFailure(404, "This record is unavailable.");
  if (code === "P0001") return new HttpFailure(422, error.message.slice(0, 180));
  if (code?.startsWith("22") || code?.startsWith("23")) return new HttpFailure(422, "Check the fields and try again.");
  return new HttpFailure(503, "The restaurant service is temporarily unavailable.");
}

export async function respond(action: () => Promise<unknown>) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "private, no-store", "X-Request-Id": requestId };
  try {
    const data = await action();
    return NextResponse.json(data ?? {}, { headers });
  } catch (error) {
    const failure = error instanceof HttpFailure ? error : new HttpFailure(503, "The restaurant service is temporarily unavailable.");
    if (failure.status >= 500) console.error(JSON.stringify({ event: "api_failure", requestId, status: failure.status }));
    return NextResponse.json({ error: { message: failure.message }, requestId }, { status: failure.status, headers });
  }
}
