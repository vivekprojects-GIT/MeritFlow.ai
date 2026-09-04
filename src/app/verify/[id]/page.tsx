import { CertificateLookup } from '@/components/certificate-lookup';

export const metadata = { title: 'Verify certificate - MeritFlow' };

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CertificateLookup id={id} mode="verify" />;
}
