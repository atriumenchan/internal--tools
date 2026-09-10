import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";

export default function Home() {
  if (!isSupabaseConfigured()) redirect("/setup");
  redirect("/dashboard");
}
