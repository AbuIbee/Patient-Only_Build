// FIVE-OFFICE ENTERPRISE PLATFORM — shared shell architecture (§6:
// "EnterpriseApplicationShell... EnterpriseSidebar... EnterpriseHeader...
// prefer improving or composing existing components rather than
// creating competing duplicates"). This is the SAME sidebar/header/
// mobile-drawer visual pattern already proven and owner-verified in
// EnterpriseCaregiverDashboard.tsx, extracted into a generic,
// office-agnostic component so the Medical Professional and Therapist
// Professional offices do not duplicate ~400 lines of shell JSX each.
//
// The shell owns presentation and drawer state. Offices own their data
// and routing. Each office component supplies
// `activeNav`/`onNavigate`, its own nav groups, and its own main
// content — matching "OfficeDashboardLayout" responsibility boundaries.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, LogOut, Menu, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NotificationBell } from '@/components/enterprise/NotificationBell';

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
  workspaceTheme?: boolean;
  headerTools?: ReactNode;
  officeSwitcher?: ReactNode;
  organizationSwitcher?: ReactNode;
  navLabel?: string;
  showNotifications?: boolean;
  navItems: OfficeNavItem<K>[];
  navGroups: OfficeNavGroup<K>[];
  activeNav: K;
  onNavigate: (key: K) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function EnterpriseOfficeShell<K extends string>({
  officeBadge, orgLabel, roleLabel, fullName, initials, workspaceTheme = false, headerTools, officeSwitcher, organizationSwitcher, navLabel, showNotifications = true,
  navItems, navGroups, activeNav, onNavigate, onLogout, children,
}: EnterpriseOfficeShellProps<K>) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isHaneenSite = import.meta.env.VITE_ENTERPRISE_SITE === 'true';
  const styledWorkspace = isHaneenSite && workspaceTheme;
  const accessibleDrawer = styledWorkspace || roleLabel === 'Caregiver';
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileNavOpen || !accessibleDrawer) return;
    const trigger = menuTrigger.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeMenu.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [mobileNavOpen, accessibleDrawer]);

  const closeMobileNav = () => setMobileNavOpen(false);

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

  const header = (
    <header className="hcn-office-header bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
      <div className="hcn-office-brand flex items-center gap-3 min-w-0">
        <button ref={menuTrigger} type="button" aria-expanded={accessibleDrawer ? mobileNavOpen : undefined} onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="lg:hidden p-1.5 -ml-1.5 text-ent-ink flex-shrink-0">
          <Menu className="w-5 h-5" />
        </button>
        {styledWorkspace ? (
          <>
            <span className="hcn-office-org-symbol" aria-hidden="true"><Building2 size={27} /></span>
            <div className="min-w-0">
              {organizationSwitcher ?? <span className="hcn-office-org-name">{orgLabel}</span>}
              <span className="hcn-office-org-caption">Licensed Organization · {roleLabel} Office</span>
            </div>
          </>
        ) : (
          <div className="text-[12.5px] sm:text-[13px] font-semibold truncate">
            {organizationSwitcher ?? <span className="text-ent-ink">{orgLabel}</span>}
            <span className="text-ent-muted"> / {roleLabel} Workspace</span>
          </div>
        )}
      </div>
      {styledWorkspace && <div className="hcn-office-header-tools">{headerTools}</div>}
      <div className="hcn-office-header-account flex items-center gap-3 flex-shrink-0">
        {showNotifications && <NotificationBell />}
        {styledWorkspace ? (
          <>
            <span className="hcn-office-avatar" title={fullName} aria-hidden="true">{initials}</span>
            {officeSwitcher ?? <span className="hidden sm:inline text-sm font-semibold">{roleLabel}</span>}
            <button type="button" onClick={onLogout} aria-label="Logout" className="hcn-office-header-logout">
              <LogOut size={19} aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <div className="hidden sm:block w-8 h-8 rounded-full bg-ent-green flex items-center justify-center text-ent-forest font-bold text-[11px]" aria-hidden="true">{initials}</div>
            <button type="button" onClick={onLogout} aria-label="Logout" className="lg:hidden p-1.5 text-ent-muted hover:text-ent-ink">
              <LogOut className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </header>
  );

  return (
    <div className={`min-h-screen bg-ent-bg flex ${styledWorkspace ? 'hcn-office-workspace' : ''}`}>
      {styledWorkspace && header}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-ent-panel border-r border-ent-line sticky top-0 h-screen hcn-workspace-navigation">
        {styledWorkspace ? (
          <div className="hcn-office-nav-title"><Building2 size={19} aria-hidden="true" />{roleLabel} Office</div>
        ) : (
          <div className="flex items-center gap-2.5 px-4 pt-5 pb-4 border-b border-ent-line">
            <div className="w-10 h-10 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0">
              {isHaneenSite ? <img src="/haneen-favicon.svg" alt="" className="w-9 h-9 rounded-lg" /> : <Sparkles className="w-5 h-5 text-ent-forest" />}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-ent-ink text-sm leading-tight truncate">{isHaneenSite ? 'Haneen Care Network' : 'My Memoria Ally'}</div>
              <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">{officeBadge}</div>
            </div>
          </div>
        )}
        <nav aria-label={navLabel ?? `${officeBadge} navigation`} className="hcn-office-nav-list flex-1 overflow-y-auto px-2.5 py-2">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="text-[9px] font-extrabold tracking-[0.16em] text-ent-muted uppercase px-2.5 pt-4 pb-1.5">{group.label}</div>
              {group.items.map((itemKey) => renderNavButton(itemKey, () => onNavigate(itemKey), false))}
            </div>
          ))}
        </nav>
        <div className="hcn-office-nav-account p-3 border-t border-ent-line flex items-center gap-2.5">
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

      <div className="hcn-office-shell-content flex-1 flex flex-col min-w-0">
        {!styledWorkspace && header}

        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={closeMobileNav}>
            <div
              className="hcn-office-drawer hcn-workspace-navigation bg-ent-panel w-72 max-w-[calc(100vw-2rem)] h-full p-2 overflow-y-auto"
              role={accessibleDrawer ? 'dialog' : undefined}
              aria-label={accessibleDrawer ? `${roleLabel} navigation` : undefined}
              aria-modal={accessibleDrawer ? true : undefined}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(event) => {
                if (!accessibleDrawer) return;
                if (event.key === 'Escape') closeMobileNav();
                if (event.key !== 'Tab') return;
                const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
                const boundary = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
                if (document.activeElement !== boundary) return;
                event.preventDefault();
                (event.shiftKey ? buttons[buttons.length - 1] : buttons[0])?.focus();
              }}
            >
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 min-w-0">
                  {!styledWorkspace && (
                    <div className="w-8 h-8 rounded-lg bg-ent-green flex items-center justify-center flex-shrink-0">{isHaneenSite ? <img src="/haneen-favicon.svg" alt="" className="w-8 h-8 rounded-lg" /> : <Sparkles className="w-4 h-4 text-ent-forest" />}</div>
                  )}
                  <span className="font-semibold text-ent-ink text-sm truncate">{orgLabel}</span>
                </div>
                <button ref={closeMenu} type="button" onClick={closeMobileNav} aria-label="Close navigation"><X className="w-5 h-5 text-ent-muted" /></button>
              </div>
              {navGroups.map((group) => (
                <div key={group.label}>
                  <div className="text-[9px] font-extrabold tracking-[0.16em] text-ent-muted uppercase px-3 pt-4 pb-1.5">{group.label}</div>
                  {group.items.map((itemKey) => renderNavButton(itemKey, () => { onNavigate(itemKey); closeMobileNav(); }, true))}
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

        <div className="hcn-office-body flex min-w-0 flex-1 flex-col">
          <main className="hcn-office-main flex-1 overflow-y-auto p-4 sm:p-6 bg-ent-bg">
            <div className="hcn-office-main-inner max-w-6xl mx-auto space-y-5">
              {!styledWorkspace && headerTools}
              {children}
            </div>
          </main>
          {styledWorkspace && <WorkspaceFooter />}
        </div>
      </div>
    </div>
  );
}

function WorkspaceFooter() {
  return (
    <footer className="hcn-workspace-footer">
      <img src="/haneen-favicon.svg" alt="" width={22} height={22} />
      <span>© {new Date().getFullYear()} Haneen Care Network</span>
    </footer>
  );
}

export function OfficeCard({ children }: { children: React.ReactNode }) {
  return <div className="hcn-office-card bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">{children}</div>;
}
