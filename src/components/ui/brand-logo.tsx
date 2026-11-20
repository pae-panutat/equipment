import { siAbb, siFujitsu, siHitachi, siLg, siMitsubishi, siPanasonic, siSamsung, siSharp, siSiemens, siToshiba, type SimpleIcon } from "simple-icons";
import { cn } from "@/lib/utils";

// Brands that simple-icons has a mark for. Several common air-conditioner and pump makes (Daikin, Carrier, Trane, Grundfos...) are not in the library,
// so they get a neutral letter tile instead of a drawn look-alike. Logos belong to their owners and are used here only to name the make of an asset.
const LOGOS: Record<string, SimpleIcon> = {
  abb: siAbb,
  fujitsu: siFujitsu,
  hitachi: siHitachi,
  lg: siLg,
  mitsubishi: siMitsubishi,
  "mitsubishi electric": siMitsubishi,
  panasonic: siPanasonic,
  samsung: siSamsung,
  sharp: siSharp,
  siemens: siSiemens,
  toshiba: siToshiba,
};

/** Small mark for an asset's make: the brand's logo (in the text colour) when known, otherwise its first letter. Decorative; the name is always written beside it. */
export function BrandLogo({ brand, className }: { brand: string | null | undefined; className?: string }) {
  const name = brand?.trim();
  if (!name) return null;
  const icon = LOGOS[name.toLowerCase()];
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground", className)} aria-hidden="true">
      {icon ? (
        <svg viewBox="0 0 24 24" className="size-5 fill-current" role="img">
          <path d={icon.path} />
        </svg>
      ) : (
        <span className="text-[15px] font-bold uppercase">{name.charAt(0)}</span>
      )}
    </span>
  );
}
