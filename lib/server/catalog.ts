import { createClient } from "@/utils/supabase/server";
import { databaseFailure, HttpFailure } from "./http";

export async function rpc(name: string, args?: Record<string, unknown>) {
  const client = await createClient();
  const { data, error } = await client.rpc(name, args);
  if (error) throw databaseFailure(error);
  return data;
}

export async function verifiedUser() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpFailure(401, "Sign in to continue.");
  return data.user;
}
