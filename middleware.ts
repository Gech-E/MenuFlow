import { type NextRequest } from "next/server";
import { updateSession } from "./utils/supabase/middleware";
export async function middleware(request: NextRequest) { return updateSession(request); }
export const config = { matcher: ["/staff/:path*", "/account/:path*", "/invite", "/register"] };
