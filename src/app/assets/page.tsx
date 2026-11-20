import { Suspense } from "react";
import { AssetsView } from "@/components/assets/assets-view";

export const dynamic = "force-dynamic";

export default function AssetsPage() {
  return (
    <Suspense fallback={null}>
      <AssetsView />
    </Suspense>
  );
}
