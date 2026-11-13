import { rpc, verifiedUser } from "@/lib/server/catalog";
import { respond } from "@/lib/server/http";

type Branch = { id: string; restaurantId: string; restaurantName: string; name: string; roles: string[] };
export async function GET() {
  return respond(async () => {
    const user = await verifiedUser();
    const context = await rpc("mf_context") as { branches: Branch[] };
    return { ...context, user: { id: user.id, email: user.email },
      memberships: context.branches.map(b => ({ restaurantId: b.restaurantId, branchId: b.id,
        name: b.restaurantName, branchName: b.name, role: b.roles[0], roles: b.roles })) };
  });
}
