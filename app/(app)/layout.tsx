import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { PageFallback, SidebarFallback } from "@/components/app-nav";

export const preferredRegion = ["bom1", "sin1"];
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/setup");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <Suspense fallback={<SidebarFallback />}>
        <AppSidebar />
      </Suspense>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </main>
    </div>
  );
}
