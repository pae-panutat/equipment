import { Suspense } from "react";
import { LabelsView } from "@/components/assets/labels-view";

export const dynamic = "force-dynamic";

export default function LabelsPage() {
  return (
    <Suspense fallback={null}>
      <LabelsView />
    </Suspense>
  );
}
