import { LogoMark } from './logo';

/** University branding (name + optional logo data URL), or null for default MeritFlow. */
export type Brand = { name: string; logoUrl: string | null } | null;

/**
 * Renders a university's logo + name when branded, else falls back to the MeritFlow mark.
 * Used on the login page and in dashboard headers.
 */
export function Brandmark({ brand, className }: { brand?: Brand; className?: string }) {
  return (
    <span className={['flex items-center gap-2.5', className].filter(Boolean).join(' ')}>
      {brand?.logoUrl ? (
        // Data-URL logos can't use next/image; a plain img is correct here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt={brand.name} className="h-9 w-9 rounded-lg object-contain" />
      ) : (
        <LogoMark className="h-8 w-8" />
      )}
      <span className="text-[21px] font-semibold tracking-tight text-ink">{brand?.name ?? 'MeritFlow'}</span>
    </span>
  );
}
