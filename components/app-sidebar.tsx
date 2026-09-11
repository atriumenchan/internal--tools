import { redirect } from "next/navigation";
import { getAppShell } from "@/lib/app-shell-data";
import { AppNav } from "@/components/app-nav";

export async function AppSidebar() {
  const shell = await getAppShell();
  if (!shell) redirect("/login");
  return (
    <AppNav profile={shell.profile} companyName={shell.companyName} operator={shell.operator} />
  );
}
