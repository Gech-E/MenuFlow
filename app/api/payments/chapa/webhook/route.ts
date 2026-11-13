import { gatewayMerchant, reconcile, validSignature } from "@/lib/server/chapa";
import { boundedBody, HttpFailure, respond, uuid } from "@/lib/server/http";

export async function POST(request: Request) {
  return respond(async () => {
    if (!gatewayMerchant()) throw new HttpFailure(503,"Gateway disabled.");
    const raw = await boundedBody(request, 32_768);
    if (!validSignature(raw, request.headers.get("x-chapa-signature"), process.env.CHAPA_WEBHOOK_SECRET!)) {
      throw new HttpFailure(401,"Invalid payment signature.");
    }
    let event;
    try { event=JSON.parse(raw.toString("utf8")); } catch { throw new HttpFailure(400,"Invalid event."); }
    if (!["charge.success","charge.failed","charge.cancelled"].includes(event?.event)) return { acknowledged: true };
    return reconcile(uuid(event.tx_ref));
  });
}
