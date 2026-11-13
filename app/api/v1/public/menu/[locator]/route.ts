import { rpc } from "@/lib/server/catalog";
import { gatewayMerchant } from "@/lib/server/chapa";
import { HttpFailure, respond, uuid } from "@/lib/server/http";

export async function GET(_request: Request, context: { params: Promise<{ locator: string }> }) {
  return respond(async () => {
    const locator = uuid((await context.params).locator);
    const menu = await rpc("mf_public_menu", { p_locator: locator });
    if (!menu) throw new HttpFailure(404, "This menu code has expired. Ask staff for the current code.");
    return { ...menu, gatewayEnabled: !!gatewayMerchant() && menu.restaurant.id === gatewayMerchant() };
  });
}
