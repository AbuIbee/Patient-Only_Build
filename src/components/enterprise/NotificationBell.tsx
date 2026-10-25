// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase I2 — the in-app notification
// center UI, reusable across every office that shares
// EnterpriseOfficeShell plus PlatformOwnerAdminPage's own bespoke
// header. Reads/mark-read only; every notification itself is created
// server-side by migration 116's triggers, never by this component.
import { useEffect, useRef, useState } from 'react';
import { Bell, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getMyNotifications, markNotificationRead, type EnterpriseNotification } from '@/services/enterpriseNotificationService';

// CODEX F-19 -- how often the bell polls for new notifications while
// mounted. No realtime channel exists for this table yet; polling is
// the "supported refresh" the finding asks for, not a claim of true
// realtime delivery.
const REFRESH_INTERVAL_MS = 20000;

export function NotificationBell() {
  const [notifications, setNotifications] = useState<EnterpriseNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const refreshing = useRef(false);

  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const { notifications: rows, error } = await getMyNotifications();
      // A transient failure on a background poll must not blank out an
      // already-successfully-loaded list -- only surface the error
      // state, keep showing the last good data underneath it.
      if (error) { setFetchError(error); return; }
      setFetchError(null);
      setNotifications(rows);
      setLoaded(true);
    } finally {
      refreshing.current = false;
    }
  };
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const openPanel = () => {
    setOpen((o) => !o);
    if (!loaded) void refresh();
  };

  // CODEX F-19 -- previously updated local state to "read" before the
  // server call even returned, so a genuinely failed mark-read (RLS
  // denial, network error) still showed as read in the UI -- a false
  // success. Now only reflects the change once the server confirms it,
  // and surfaces a failure instead of silently discarding it.
  const markRead = async (id: string) => {
    const { error } = await markNotificationRead(id);
    if (error) { toast.error(`Couldn't mark that as read: ${error}`); return; }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
  };

  return (
    <div className="relative">
      <button
        type="button" onClick={openPanel} aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className="relative p-1.5 text-ent-muted hover:text-ent-ink rounded-lg hover:bg-ent-pale"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ent-rust text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-ent-panel border border-ent-line rounded-xl shadow-lg z-50">
          <div className="p-3 border-b border-ent-line">
            <p className="text-sm font-bold text-ent-ink">Notifications</p>
          </div>
          {fetchError && notifications.length === 0 ? (
            <p className="p-4 text-sm text-ent-rust flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Couldn't load notifications: {fetchError}</p>
          ) : notifications.length === 0 ? (
            <p className="p-4 text-sm text-ent-muted">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-ent-line">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button" onClick={() => { if (!n.readAt) void markRead(n.id); }}
                    className={`w-full text-left p-3 hover:bg-ent-pale ${n.readAt ? '' : 'bg-ent-green-active/30'}`}
                  >
                    <p className="text-sm font-semibold text-ent-ink">{n.title}</p>
                    {n.body && <p className="text-xs text-ent-text mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[11px] text-ent-muted mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
