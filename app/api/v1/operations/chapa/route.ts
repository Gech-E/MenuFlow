import { cookies } from "next/headers";
import { gatewayDatabase, gatewayMerchant, initializePayment, reconcile } from "@/lib/server/chapa";
import { checkMutation, databaseFailure, HttpFailure, readObject, respond, uuid } from "@/lib/server/http";

export async function POST(request: Request) {
  return respond(async () => {
    checkMutation(request);
    const body = await readObject(request);
    const token = (await cookies()).get("mf_diner")?.value;
    if (!token) throw new HttpFailure(403,"Table admission required.");
    const db = gatewayDatabase();
    const locator = uuid(body.locator), sessionId = uuid(body.sessionId);
    if (!Number.isSafeInteger(body.version) || typeof body.email !== "string" || body.email.length>254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new HttpFailure(422,"Enter a valid payment email and refresh your bill.");
    const { data: intent, error } = await db.rpc("mf_gateway_begin", {
      p_session: sessionId, p_version: body.version, p_device: token, p_merchant: gatewayMerchant(),
    });
    if (error) throw databaseFailure(error);
    if (body.checkStatus === true) return reconcile(uuid(intent.txRef));
    if (intent.checkoutUrl) return { checkoutUrl: intent.checkoutUrl };
    const checkoutUrl = await initializePayment(uuid(intent.txRef), intent.amountMinor, body.email, locator);
    const { error: saveError } = await db.from("gateway_payments").update({ checkout_url: checkoutUrl }).eq("tx_ref",intent.txRef).eq("state","pending");
    if (saveError) throw databaseFailure(saveError);
    return { checkoutUrl };
  });
}
