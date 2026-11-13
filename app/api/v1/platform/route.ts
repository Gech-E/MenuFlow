import { rpc, verifiedUser } from "@/lib/server/catalog";
import { checkMutation, readObject, respond } from "@/lib/server/http";

export async function GET() {
  return respond(async () => {
    await verifiedUser();
    return rpc("mf_platform", { p_action: "list", p_data: {} });
  });
}

export async function POST(request: Request) {
  return respond(async () => {
    checkMutation(request);
    await verifiedUser();
    return rpc("mf_platform", { p_action: "update", p_data: await readObject(request) });
  });
}
