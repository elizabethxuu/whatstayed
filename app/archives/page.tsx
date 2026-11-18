import type { Metadata } from 'next';
import Archives from '@/components/Archives';

export const metadata: Metadata = {
  title: 'The Archives · What Stayed',
  description: 'Things I wanted to remember.',
};

export default function Page() {
  return <Archives />;
}
