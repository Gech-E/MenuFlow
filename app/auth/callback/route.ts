import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { configuredOrigin } from "@/lib/server/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = configuredOrigin(request);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const requested = url.searchParams.get("next") ?? "/staff";
      const destination = new URL("/staff", origin);
      if (requested.startsWith("/")) {
        const next = new URL(requested, origin);
        if (next.origin === origin && ["/staff", "/register", "/invite", "/account/password"].includes(next.pathname)) {
          destination.pathname = next.pathname;
          destination.search = next.search;
        }
      }
      return NextResponse.redirect(destination, 303);
    }
  }
  return NextResponse.redirect(new URL("/staff?verification=expired", origin), 303);
}
