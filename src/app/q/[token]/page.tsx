import { ScanView } from "@/components/assets/scan-view";

export const dynamic = "force-dynamic";

// Opened by scanning an asset's QR code. Signed-out visitors are sent to /login first (see AuthProvider) and come back here.
export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ScanView token={token} />;
}
