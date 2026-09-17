import { Suspense } from "react";
import { PageFallback } from "@/components/app-nav";
import { HandbookHome } from "./handbook-home";

export default function HandbookPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <HandbookHome />
    </Suspense>
  );
}
