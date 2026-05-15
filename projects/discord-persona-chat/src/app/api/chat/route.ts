import { NextResponse } from "next/server";
import { getChatProvider } from "@/lib/ai/provider";
import { parseChatRequestBody } from "@/lib/api/chat-schema";

export async function POST(request: Request) {
  try {
    const body = parseChatRequestBody(await request.json());
    const provider = getChatProvider(body.provider ?? "openai");
    const result = await provider.generate({
      profile: body.profile,
      messages: body.messages,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate a reply.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
