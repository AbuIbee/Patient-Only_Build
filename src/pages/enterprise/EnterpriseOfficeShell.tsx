// FIVE-OFFICE ENTERPRISE PLATFORM — shared shell architecture (§6:
// "EnterpriseApplicationShell... EnterpriseSidebar... EnterpriseHeader...
// prefer improving or composing existing components rather than
// creating competing duplicates"). This is the SAME sidebar/header/
// mobile-drawer visual pattern already proven and owner-verified in
// EnterpriseCaregiverDashboard.tsx, extracted into a generic,
// office-agnostic component so the Medical Professional and Therapist
// Professional offices do not duplicate ~400 lines of shell JSX each.
//
// Deliberately NOT retrofitted onto EnterpriseCaregiverDashboard.tsx in
// this pass — that component is large, already shipped, and already
// independently browser-verified; forcing an in-place refactor onto it
// risks a regression in already-working, owner-reviewed functionality
// for no functional gain. It remains a natural candidate for a later,
// dedicated, low-risk refactor once this shell has proven itself across
// the two new offices. Flagged here rather than done silently.
//
// The shell is a pure, controlled presentational component: it owns no
// data-fetching and no routing state. Each office component supplies
// `activeNav`/`onNavigate`, its own nav groups, and its own main
// content — matching "OfficeDashboardLayout" responsibility boundaries.
import { useState } from 'react';
import { LogOut, Menu, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface OfficeNavItem<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
}

export interface OfficeNavGroup<K extends string> {
  label: string;
  items: K[];
}

export interface EnterpriseOfficeShellProps<K extends string> {
  /** Small-caps badge under the logo, e.g. "ENTERPRISE CARE". */
  officeBadge: string;
  orgLabel: string;
  roleLabel: string;
  fullName: string;
  initials: string;
  navItems: OfficeNavItem<K>[];
  navGroups: OfficeNavGroup<K>[];
  activeNav: K;
  onNavigate: (key: K) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function EnterpriseOfficeShell<K extends string>({
  officeBadge, orgLabel, roleLabel, fullName, initials,
  navItems, navGroups, activeNav, onNavigate, onLogout, children,
}: EnterpriseOfficeShellProps<K>) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const renderNavButton = (itemKey: K, onClick: () => void, mobile: boolean) => {
    const item = navItems.find((n) => n.key === itemKey);
    if (!item) return null;
    const Icon = item.icon;
    const isActive = activeNav === itemKey;
    return (
      <button
        key={itemKey} type="button" aria-current={isActive ? 'page' : undefined}
        onClick={onClick}
        className={
          mobile
            ? `w-full flex items-center gap-2.5 px-3 py-3 text-sm text-left rounded-lg font-semibold ${isActive ? 'bg-ent-green-active text-ent-forest' : 'text-ent-text'}`
            : `w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left text-[12.5px] font-semibold transition-colors ${isActive ? 'bg-ent-green-active text-ent-forest' : 'text-ent-text hover:bg-ent-pale'}`
        }
      >
        <Icon className="w-4 h-4 flex-shrink-0" /> {item.label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-ent-bg flex">
      <aside className="hidden lg:flex lg:flex-col w-64 bg-ent-panel border-r border-ent-line sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4 border-b border-ent-line">
          <div className="w-10 h-10 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-ent-forest" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-ent-ink text-sm leading-tight truncate">My Memoria Ally</div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">{officeBadge}</div>
          </div>
        </div>
        <nav aria-label={`${officeBadge} navigation`} className="flex-1 overflow-y-auto px-2.5 py-2">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="text-[9px] font-extrabold tracking-[0.16em] text-ent-muted uppercase px-2.5 pt-4 pb-1.5">{group.label}</div>
              {group.items.map((itemKey) => renderNavButton(itemKey, () => onNavigate(itemKey), false))}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-ent-line flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-xs flex-shrink-0" aria-hidden="true">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-ent-ink truncate">{fullName}</div>
            <div className="text-[11px] text-ent-muted truncate">{roleLabel}</div>
          </div>
          <button type="button" onClick={onLogout} aria-label="Logout" className="p-1.5 text-ent-muted hover:text-ent-ink flex-shrink-0 rounded-lg hover:bg-ent-pale">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="lg:hidden p-1.5 -ml-1.5 text-ent-ink flex-shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-[12.5px] sm:text-[13px] font-semibold truncate">
              <span className="text-ent-ink">{orgLabel}</span>
              <span className="text-ent-muted"> / {roleLabel} Workspace</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:block w-8 h-8 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-[11px]" aria-hidden="true">{initials}</div>
            <button type="button" onClick={onLogout} aria-label="Logout" className="lg:hidden p-1.5 text-ent-muted hover:text-ent-ink">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileNavOpen(false)}>
            <div className="bg-ent-panel w-72 h-full p-2 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-ent-green flex items-center justify-center flex-shrink-0"><Sparkles className="w-4 h-4 text-ent-forest" /></div>
                  <span className="font-semibold text-ent-ink text-sm truncate">{orgLabel}</span>
                </div>
                <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X className="w-5 h-5 text-ent-muted" /></button>
              </div>
              {navGroups.map((group) => (
                <div key={group.label}>
                  <div className="text-[9px] font-extrabold tracking-[0.16em] text-ent-muted uppercase px-3 pt-4 pb-1.5">{group.label}</div>
                  {group.items.map((itemKey) => renderNavButton(itemKey, () => { onNavigate(itemKey); setMobileNavOpen(false); }, true))}
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-ent-line px-3 py-2 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-xs flex-shrink-0">{initials}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ent-ink truncate">{fullName}</div>
                  <div className="text-[11px] text-ent-muted truncate">{roleLabel}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-ent-bg">
          <div className="max-w-6xl mx-auto space-y-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function OfficeCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">{children}</div>;
}
