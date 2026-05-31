"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Bell, Check, CheckFat, ArrowLeft } from "@phosphor-icons/react";
import Pagination from "@/components/admin/Pagination";
import Link from "next/link";

function timeAgo(date: string): string {
  const sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback((pageNum?: number) => {
    setLoading(true);
    const params: Record<string, string> = { page: String(pageNum || 1), limit: "20" };
    api.getNotifications(params)
      .then((res) => { setNotifications(res.notifications); setPagination(res.pagination); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authLoading && !user) { router.push("/auth/login"); return; }
    if (user) load();
  }, [user, authLoading, load, router]);

  const handleMarkRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg p-2 text-muted hover:bg-white hover:text-ink transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-ink">Notifications</h1>
              {pagination.total > 0 && (
                <p className="text-sm text-muted">{pagination.total} notification{pagination.total !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
          {notifications.some((n) => !n.is_read) && (
            <button onClick={handleMarkAllRead} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft/50 transition-colors">
              <CheckFat size={16} />
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white py-16">
            <Bell size={40} className="text-muted mb-3" />
            <p className="text-sm font-medium text-ink">No notifications yet</p>
            <p className="mt-1 text-xs text-muted">Notifications from procurement activity will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`group flex items-start gap-4 rounded-xl border border-border px-4 py-4 transition-colors ${!n.is_read ? "bg-accent-soft/20 border-accent/20" : "bg-white hover:bg-surface"}`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${!n.is_read ? "bg-accent text-white" : "bg-surface text-muted"}`}>
                  <Bell size={16} weight={!n.is_read ? "fill" : "regular"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {n.link ? (
                        <Link href={n.link} className={`text-sm after:absolute after:inset-0 ${!n.is_read ? "font-semibold text-ink" : "text-ink"}`}>
                          {n.title}
                        </Link>
                      ) : (
                        <p className={`text-sm ${!n.is_read ? "font-semibold text-ink" : "text-ink"}`}>{n.title}</p>
                      )}
                      {n.description && <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.description}</p>}
                      <p className="mt-1.5 text-[11px] text-soft">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="relative z-10 shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface hover:text-accent transition-colors"
                        aria-label="Mark as read"
                      >
                        <Check size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="mt-6">
            <Pagination
              page={pagination.page}
              totalPages={pagination.pages}
              onPageChange={(p) => load(p)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
