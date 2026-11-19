import { redirect } from 'next/navigation';

/** The account page became You. */
export default function Page() {
  redirect('/you');
}
