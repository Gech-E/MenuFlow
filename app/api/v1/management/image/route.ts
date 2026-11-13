import { rpc, verifiedUser } from "@/lib/server/catalog";
import { boundedBody, checkMutation, HttpFailure, respond, uuid } from "@/lib/server/http";
import { normalizedImage } from "@/lib/server/image";

export async function POST(request: Request) {
  return respond(async () => {
    checkMutation(request);
    await verifiedUser();
    const type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("multipart/form-data;")) throw new HttpFailure(415, "Choose an image to upload.");
    const bytes = await boundedBody(request, 4_000_000);
    const form = await new Response(new Uint8Array(bytes), { headers: { "content-type": type } }).formData();
    const file = form.get("file");
    const branchId = uuid(form.get("branchId"));
    if (!(file instanceof File)) throw new HttpFailure(400, "Choose an image.");
    const safe = await normalizedImage(Buffer.from(await file.arrayBuffer()));
    const id = uuid(await rpc("mf_store_image", { p_branch: branchId, p_data: safe.toString("base64") }));
    return { id, imagePath: "/api/images/" + id };
  });
}
