import { AssetDetailView } from "@/components/assets/asset-detail-view";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssetDetailView id={id} />;
}
