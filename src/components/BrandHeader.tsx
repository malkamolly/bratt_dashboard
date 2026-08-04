import {
  getAllowedUser,
  canAccessHub,
  canSeeCostAnalysis,
  canUsePhcScheduling,
  canUseSops,
  canUseOffSeason,
  isOwner,
  type Role,
} from '@/lib/auth';
import { isTagsUser } from '@/lib/tags-config';
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
    if (canSeeCostAnalysis(user.email)) salesItems.push({ label: 'Cost Analysis', href: '/cost-analysis' });
    if (canSeeCostAnalysis(user.email)) salesItems.push({ label: 'Job Costing', href: '/cost-analysis/job-costing' });

    const productionItems: NavItem[] = [];
    if (canAccessHub(r, 'pace'))
      productionItems.push({ label: 'Production PACE', href: '/production' });
    if (canSeeSchedule(r)) {
      productionItems.push({ label: "Tomorrow's Schedule", href: '/schedule' });
      productionItems.push({ label: 'Forecast vs Actual', href: '/schedule/accuracy' });
    }
    if (canAccessHub(r, 'crew'))
      productionItems.push({ label: 'Field Crew Hub', href: '/crew' });

    // Office tools — pace dashboards' sibling hub plus the office-only tools.
    const officeItems: NavItem[] = [];
    if (canAccessHub(r, 'pace')) officeItems.push({ label: 'Office Hub', href: '/office' });
    if (canUseOffSeason(r)) officeItems.push({ label: 'Off-Season Work', href: '/off-season' });
    if (canUsePhcScheduling(r)) officeItems.push({ label: 'PHC Scheduling', href: '/phc' });
    if (canUseSops(r)) officeItems.push({ label: 'SOP Library', href: '/sops' });
    if (isTagsUser(user.email)) officeItems.push({ label: 'Slack Tags', href: '/tags' });

    if (salesItems.length > 0) groups.push({ label: 'Sales', items: salesItems });
    if (productionItems.length > 0)
      groups.push({ label: 'Production', items: productionItems });
    if (officeItems.length > 0) groups.push({ label: 'Office', items: officeItems });
  }

  // Admin gets its own dropdown (admins only). Mirrors the cards on the
  // /admin landing page. The private My Projects hub is tucked in here too,
  // but gated by email so only the single owner sees it — other admins don't.
  const adminGroup: NavGroup | null =
    user?.role === 'admin'
      ? {
          label: 'Admin',
          items: [
            { label: 'Overview', href: '/admin' },
            { label: 'Sales Admin', href: '/admin/sales' },
            { label: 'Production Admin', href: '/admin/production' },
            { label: 'Access', href: '/admin/access' },
            ...(isOwner(user.email)
              ? [{ label: 'My Projects', href: '/projects' }]
              : []),
          ],
        }
      : null;

  return <BrandHeaderClient user={user} groups={groups} adminGroup={adminGroup} />;
}
