import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { databaseFailure, HttpFailure } from "./http";

export function gatewayMerchant() {
  const merchant = process.env.CHAPA_RESTAURANT_ID;
  return process.env.CHAPA_SECRET_KEY?.startsWith("CHASECK_LIVE-") && process.env.CHAPA_WEBHOOK_SECRET &&
    process.env.SUPABASE_SECRET_KEY && process.env.APP_ORIGIN?.startsWith("https://") ? merchant : undefined;
}

export function gatewayDatabase() {
  if (!gatewayMerchant()) throw new HttpFailure(503, "Online payment is unavailable for this restaurant.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function validSignature(raw: Buffer, header: string | null, secret: string) {
  if (!header || !/^[0-9a-f]{64}$/i.test(header)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(raw).digest(), Buffer.from(header,"hex"));
}

type Verified = { status: string; mode: string; currency: string; amount: unknown; tx_ref: string; reference: string };
export function matchVerification(raw: Verified, expected: {ref:string; amount:string; currency:string}) {
  const decimal = String(raw.amount);
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(decimal)) return false;
  const [whole, fraction=""] = decimal.split(".");
  return raw.tx_ref === expected.ref && raw.mode === "live" && raw.currency === expected.currency &&
    BigInt(whole + fraction.padEnd(2,"0")).toString() === expected.amount;
}

async function provider(path: string, body?: object) {
  const response = await fetch("https://api.chapa.co/v1/transaction/" + path, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    headers: { Authorization: "Bearer " + process.env.CHAPA_SECRET_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new HttpFailure(502,"The payment provider could not confirm this request. Please retry or ask your cashier.");
  const result = await response.json();
  if (result?.status !== "success" || !result.data) throw new HttpFailure(502,"Payment confirmation is unavailable.");
  return result.data;
}

export async function initializePayment(ref: string, amount: string, email: string, locator: string) {
  const total = amount.padStart(3,"0");
  const data = await provider("initialize", {
    tx_ref: ref, amount: total.slice(0,-2) + "." + total.slice(-2), currency: "ETB", email,
    return_url: process.env.APP_ORIGIN + "/t/" + locator,
  });
  const url = new URL(data.checkout_url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.chapa.co" || url.username || url.password || url.port) {
    throw new HttpFailure(502,"Invalid payment provider response.");
  }
  return url.href;
}

export async function reconcile(ref: string) {
  const db = gatewayDatabase();
  const { data: intent, error } = await db.from("gateway_payments").select("amount_minor,currency").eq("tx_ref",ref).maybeSingle();
  if (error) throw databaseFailure(error);
  if (!intent) return { status: "unknown" };
  const raw = await provider("verify/" + ref) as Verified;
  if (!matchVerification(raw, { ref, amount: String(intent.amount_minor), currency: intent.currency })) {
    throw new HttpFailure(409,"Payment verification does not match the submitted invoice.");
  }
  if (raw.status !== "success" && !["failed","cancelled"].includes(raw.status)) return { status: "pending" };
  const { data, error: verificationError } = await db.rpc("mf_gateway_verify", {
    p_ref: ref, p_merchant: gatewayMerchant(), p_reference: raw.reference ?? "",
    p_amount: String(intent.amount_minor), p_currency: intent.currency, p_success: raw.status === "success",
  });
  if (verificationError) throw databaseFailure(verificationError);
  return { status: raw.status, receiptId: data };
}
