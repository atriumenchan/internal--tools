"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { EmployeeDirectory } from "./directory";
import { createClient } from "@/lib/supabase/client";
import { isIgnoredEmployee } from "@/lib/admin";
import { useAppState } from "@/components/app-frame";
import { PageFallback } from "@/components/app-nav";
import type { Employee } from "@/lib/types";

export default function EmployeesPage() {
  const app = useAppState();
  const router = useRouter();
  const [people, setPeople] = useState<Employee[] | null>(null);

  useEffect(() => {
    if (app && !app.operator) router.replace("/dashboard");
  }, [app, router]);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("employees")
      .select("*")
      .order("employee_code")
      .then(({ data }) => {
        setPeople(
          ((data ?? []) as Employee[]).filter(
            (e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name)
          )
        );
      });
  }, []);

  if (app && !app.operator) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="People"
        description="This list lives in Supabase. Logins are created on Staff. Ryan Ray is excluded."
      />
      {people ? <EmployeeDirectory employees={people} /> : <PageFallback />}
    </div>
  );
}
