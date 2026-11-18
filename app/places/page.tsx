import type { Metadata } from 'next';
import { Suspense } from 'react';
import Places from '@/components/Places';

export const metadata: Metadata = {
  title: 'Places · What Stayed',
  description: 'Some places never really leave us.',
};

export default function Page() {
  return (
    <Suspense fallback={<main className="places" aria-busy="true" />}>
      <Places />
    </Suspense>
  );
}
