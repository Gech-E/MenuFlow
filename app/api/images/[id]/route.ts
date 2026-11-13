import { rpc } from "@/lib/server/catalog";
import { HttpFailure, uuid } from "@/lib/server/http";
import { normalizedImage } from "@/lib/server/image";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = uuid((await context.params).id);
    const data = await rpc("mf_get_image", { p_id: id });
    if (typeof data !== "string") throw new HttpFailure(404, "Image unavailable.");
    const bytes = await normalizedImage(Buffer.from(data, "base64"));
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=120",
    } });
  } catch (error) {
    return new Response(null, { status: error instanceof HttpFailure ? error.status : 503 });
  }
}
