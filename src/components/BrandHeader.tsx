import { getAllowedUser, canAccessHub, type Role } from '@/lib/auth';
import { BrandHeaderClient, type NavGroup, type NavItem } from './BrandHeaderClient';

// Tomorrow's Schedule + Forecast vs Actual are gated to office/admin (same as
// the /schedule page itself), not the whole Pace hub.
function canSeeSchedule(role: Role): boolean {
  return role === 'admin' || role === 'user';
}

export async function BrandHeader() {
  const user = await getAllowedUser();

  // Build the nav from the user's role so every menu only lists pages they can
  // actually open. Items are filtered here (server-side) and handed to the
  // client header as a plain data model.
  const groups: NavGroup[] = [];
  if (user) {
    const r = user.role;

    const salesItems: NavItem[] = [];
    if (canAccessHub(r, 'pace')) salesItems.push({ label: 'Sales PACE', href: '/sales' });
    if (canAccessHub(r, 'hub')) salesItems.push({ label: 'Sales Arborist Hub', href: '/hub' });

    const productionItems: NavItem[] = [];
    if (canAccessHub(r, 'pace'))
      productionItems.push({ label: 'Production PACE', href: '/production' });
    if (canSeeSchedule(r)) {
      productionItems.push({ label: "Tomorrow's Schedule", href: '/schedule' });
      productionItems.push({ label: 'Forecast vs Actual', href: '/schedule/accuracy' });
    }
    if (canAccessHub(r, 'crew'))
      productionItems.push({ label: 'Field Crew Hub', href: '/crew' });

    if (salesItems.length > 0) groups.push({ label: 'Sales', items: salesItems });
    if (productionItems.length > 0)
      groups.push({ label: 'Production', items: productionItems });
  }

  return <BrandHeaderClient user={user} groups={groups} />;
}
