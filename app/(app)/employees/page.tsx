import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { EmployeeDirectory } from "./directory";
import type { Employee } from "@/lib/types";

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("*").order("full_name");

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="People"
        description="Codes and names here are matched against the Excel. Add them first, or let the upload create anyone new."
      />
      <EmployeeDirectory employees={(data ?? []) as Employee[]} />
    </div>
  );
}
