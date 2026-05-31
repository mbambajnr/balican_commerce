"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Bell, X } from "@phosphor-icons/react";
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

export default function NotificationBell({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.getUnreadCount();
      setUnread(res.unread);
    } catch {}
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications({ limit: "10" });
      setNotifications(res.notifications);
      setUnread(res.notifications.filter((n: any) => !n.is_read).length);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleToggle = () => {
    if (!open) fetchAll();
    setOpen(!open);
  };

  const handleMarkRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const textColor = variant === "dark" ? "text-zinc-300 hover:text-white" : "text-muted hover:text-ink";
  const dropdownBg = variant === "dark" ? "bg-navy" : "bg-white";

  return (
    <div ref={ref} className="relative">
      <button onClick={handleToggle} className={`relative rounded-lg p-2 transition-colors ${textColor}`} aria-label="Notifications">
        <Bell size={20} weight={unread > 0 ? "fill" : "regular"} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border shadow-lg ${dropdownBg}`}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-accent hover:underline">Mark all read</button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-soft">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group flex items-start gap-3 border-b border-border/50 px-4 py-3 text-sm transition-colors hover:bg-surface ${!n.is_read ? "bg-accent-soft/30" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="after:absolute after:inset-0">
                        <p className={`${n.is_read ? "text-ink" : "font-medium text-ink"}`}>{n.title}</p>
                      </Link>
                    ) : (
                      <p className={n.is_read ? "text-ink" : "font-medium text-ink"}>{n.title}</p>
                    )}
                    {n.description && <p className="mt-0.5 text-xs text-soft line-clamp-2">{n.description}</p>}
                    <p className="mt-1 text-[11px] text-muted">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="relative z-10 mt-0.5 shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100"
                      aria-label="Mark as read"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-accent hover:bg-surface transition-colors"
            >
              View all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
