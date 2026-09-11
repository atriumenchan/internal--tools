import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { EmployeeDirectory } from "./directory";
import { isIgnoredEmployee } from "@/lib/admin";
import type { Employee } from "@/lib/types";

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("*").order("employee_code");
  const people = ((data ?? []) as Employee[]).filter(
    (e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name)
  );

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="People"
        description="This list lives in Supabase. Logins are created on Staff. Ryan Ray is excluded."
      />
      <EmployeeDirectory employees={people} />
    </div>
  );
}
