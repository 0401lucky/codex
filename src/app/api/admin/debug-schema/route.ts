import { NextResponse } from "next/server";
import { db } from "@/lib/mysql";

// 临时公开接口，用完后删除
export async function GET() {
  try {
    const columns = await db.query<{ Field: string; Type: string }>(
      "DESCRIBE users"
    );
    return NextResponse.json({ success: true, columns });
  } catch (error) {
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  }
}
