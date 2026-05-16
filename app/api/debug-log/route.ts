import { NextResponse } from "next/server";
import fs from "node:fs";

const LOG_PATH = "/Users/vivek/gls-plus/.cursor/debug-e92783.log";
const SESSION_ID = "e92783";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const sessionId = (body as any).sessionId;
    if (sessionId !== SESSION_ID) {
      return NextResponse.json({ ok: false, error: "wrong_session" }, { status: 403 });
    }
    fs.mkdirSync("/Users/vivek/gls-plus/.cursor", { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(body) + "\n");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

