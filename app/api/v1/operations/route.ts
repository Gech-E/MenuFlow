import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";
import { checkMutation, databaseFailure, HttpFailure, readObject, respond } from "../../../../lib/server/http";

export const dynamic = "force-dynamic";
const guestCookie = "mf_diner";
const actions = new Set([
  "open", "issueCode", "join", "quote", "order", "cancel", "transition",
  "request", "requestStatus", "checkout", "discount", "reopen", "settle", "void", "assign",
]);

async function call(action: string, body: Record<string, unknown>, token?: string) {
  const db = await createClient();
  const { data, error } = await db.rpc("mf_operations", {
    p_action: action, p_body: body, p_device: token ?? null,
  });
  if (error) throw databaseFailure(error);
  if (data?.rateLimited) throw new HttpFailure(429, "Too many admission attempts. Try again in a minute.");
  if (data?.admissionError) throw new HttpFailure(403, "Ask your waiter for a current admission code.");
  return data;
}

export function GET(request: Request) {
  return respond(async () => {
    const params = new URL(request.url).searchParams;
    const view = params.get("view");
    if (view === "guest") return call("guestState", {}, (await cookies()).get(guestCookie)?.value);
    if (view !== "staff") throw new HttpFailure(400, "Choose a valid operations view.");
    return call("staffState", Object.fromEntries(params));
  });
}

export function POST(request: Request) {
  return respond(async () => {
    checkMutation(request);
    const { action, ...body } = await readObject(request);
    if (typeof action !== "string" || !actions.has(action)) throw new HttpFailure(400, "Unknown action.");
    const jar = await cookies();
    const token = action === "join" ? randomBytes(32).toString("base64url") : jar.get(guestCookie)?.value;
    const result = await call(action, body, token);
    if (action === "join" && token) {
      jar.set(guestCookie, token, {
        httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
        path: "/api/v1/operations", maxAge: 48 * 60 * 60,
      });
    }
    return result;
  });
}
