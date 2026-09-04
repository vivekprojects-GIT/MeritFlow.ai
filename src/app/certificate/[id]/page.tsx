import { CertificateLookup } from '@/components/certificate-lookup';

export const metadata = { title: 'Certificate - MeritFlow' };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CertificateLookup id={id} mode="certificate" />;
}
