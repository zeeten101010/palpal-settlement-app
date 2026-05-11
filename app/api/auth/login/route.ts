import { NextResponse } from "next/server";
import { createSessionValue, setAuthCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json();

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.json({ error: "APP_PASSWORD is missing" }, { status: 500 });
  }

  if (!password || password !== appPassword) {
    return NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  await setAuthCookie(createSessionValue());
  return NextResponse.json({ ok: true });
}
