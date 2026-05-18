import { getAllowedUser } from '@/lib/auth';
import { BrandHeaderClient } from './BrandHeaderClient';

export async function BrandHeader() {
  const user = await getAllowedUser();
  return <BrandHeaderClient user={user} />;
}
