import { getStatus } from "@/lib/agent";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getStatus());
  } catch (error) {
    return Response.json({
      ready: false,
      model: "invalid configuration",
      message: (error as Error).message,
    });
  }
}
