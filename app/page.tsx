import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/utils";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = first(params.error) ?? first(params.error_description);
  if (error || first(params.error_code)) {
    const q = new URLSearchParams();
    if (error) q.set("error", error);
    if (first(params.error_code)) q.set("error_code", first(params.error_code)!);
    redirect(`/login?${q.toString()}`);
  }

  if (!isSupabaseConfigured()) redirect("/setup");
  redirect("/spaces");
}

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
