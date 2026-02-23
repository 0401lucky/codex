import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getAdminUsernames(): string[] {
  const adminEnv = process.env.ADMIN_USERNAMES;
  if (!adminEnv) return [];
  return adminEnv
    .replace(/\\r\\n|\\n|\\r/g, "")
    .replace(/[\r\n]/g, "")
    .trim()
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

async function verifySessionSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedSignature = hexEncode(sig);
  return timingSafeCompare(expectedSignature, signature);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("app_session")?.value;
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const parts = sessionCookie.split(".");
  if (parts.length !== 2) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const [payload, signature] = parts;
  const valid = await verifySessionSignature(payload, signature, secret);
  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const decoded = atob(payload);
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (typeof parsed.exp === "number" && parsed.exp < Date.now()) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const username = typeof parsed.username === "string" ? parsed.username : "";
    const adminUsernames = getAdminUsernames();
    if (!adminUsernames.includes(username)) {
      return NextResponse.redirect(new URL("/lottery", request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
