import { redirect } from 'next/navigation';
import { getSession, type UserWithBrand } from '@/lib/auth-session';

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const brandId = (session.user as UserWithBrand).brandId;
  if (!brandId) {
    redirect('/brands');
  }

  redirect('/dashboard');
}
