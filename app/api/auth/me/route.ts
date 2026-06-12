import { NextResponse } from "next/server";

import { getAppUser } from "@/lib/auth-server";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
