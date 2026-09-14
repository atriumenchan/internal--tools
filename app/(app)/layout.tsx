import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";
import { AppFrame } from "@/components/app-frame";

export const preferredRegion = ["bom1", "sin1"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/setup");
  return <AppFrame>{children}</AppFrame>;
}
