import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getAuthUser();

  if (user) {
    redirect("/lottery");
  } else {
    redirect("/login");
  }
}
