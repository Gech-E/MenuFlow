import { rpc, verifiedUser } from "@/lib/server/catalog";
import { checkMutation, HttpFailure, readObject, respond, uuid } from "@/lib/server/http";

export async function GET(request: Request) {
  return respond(async () => {
    await verifiedUser();
    return rpc("mf_workspace", { p_branch: uuid(new URL(request.url).searchParams.get("branchId")) });
  });
}

export async function POST(request: Request) {
  return respond(async () => {
    checkMutation(request);
    await verifiedUser();
    const body = await readObject(request);
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      throw new HttpFailure(400, "Provide the fields for this action.");
    }
    const data = body.data as Record<string, unknown>;
    if (body.action === "onboard") {
      return rpc("mf_onboard", { p_name: data.name, p_branch_name: data.branchName ?? "Main" });
    }
    if (body.action === "accept_invite") return rpc("mf_accept_invite", { p_token: data.token });
    if (typeof body.action !== "string" || body.action.length > 48) throw new HttpFailure(400, "Invalid operation.");
    return rpc("mf_manage", { p_branch: uuid(body.branchId), p_action: body.action, p_data: data });
  });
}
