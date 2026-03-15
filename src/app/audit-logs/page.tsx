"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ScrollText, ChevronDown, Filter, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api-client";

// ── Types ──

interface EventLog {
  uuid: string;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_name: string | null;
  summary: string;
  changes: { field: string; from?: unknown; to?: unknown }[] | null;
  source_ip: string | null;
  created_at: string;
}

// ── Constants ──

const ACTION_LABELS: Record<string, string> = {
  create: "作成",
  update: "更新",
  deactivate: "無効化",
  delete: "削除",
  restore: "復元",
  reverse: "逆仕訳",
  close: "締め",
  reopen: "再開",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-900/30 text-green-400 border-green-800/50",
  update: "bg-blue-900/30 text-blue-400 border-blue-800/50",
  deactivate: "bg-red-900/30 text-red-400 border-red-800/50",
  delete: "bg-red-900/30 text-red-400 border-red-800/50",
  restore: "bg-yellow-900/30 text-yellow-400 border-yellow-800/50",
  reverse: "bg-orange-900/30 text-orange-400 border-orange-800/50",
  close: "bg-gray-900/30 text-gray-400 border-gray-800/50",
  reopen: "bg-teal-900/30 text-teal-400 border-teal-800/50",
};

const ENTITY_LABELS: Record<string, string> = {
  user: "ユーザー",
  role: "ロール",
  tenant: "テナント",
  book: "帳簿",
  account: "科目",
  department: "部門",
  counterparty: "取引先",
  tag: "タグ",
  voucher_type: "伝票種別",
  journal_type: "仕訳種別",
  period: "期間",
  project: "プロジェクト",
  voucher: "伝票",
  journal: "仕訳",
  api_key: "API Key",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-blue-900/30 text-blue-400 border-blue-800/50",
  user: "bg-green-900/30 text-green-400 border-green-800/50",
  platform: "bg-purple-900/30 text-purple-400 border-purple-800/50",
  audit: "bg-red-900/30 text-red-400 border-red-800/50",
};

const ENTITY_TYPES = Object.keys(ENTITY_LABELS);

// ── Page ──

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filters
  const [entityFilter, setEntityFilter] = useState("__all__");
  const [actionFilter, setActionFilter] = useState("__all__");

  const scrollRef = useRef<HTMLDivElement>(null);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({ limit: "50" });
    if (entityFilter !== "__all__") params.set("entity_type", entityFilter);
    if (actionFilter !== "__all__") params.set("action", actionFilter);
    return params;
  }, [entityFilter, actionFilter]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildQuery();
      const res = await api.get<{ data: EventLog[]; next_cursor: string | null }>(
        `/event-logs?${params.toString()}`
      );
      setLogs(res.data);
      setCursor(res.next_cursor);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "イベントログの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = buildQuery();
      params.set("cursor", cursor);
      const res = await api.get<{ data: EventLog[]; next_cursor: string | null }>(
        `/event-logs?${params.toString()}`
      );
      setLogs((prev) => [...prev, ...res.data]);
      setCursor(res.next_cursor);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "追加読み込みに失敗しました");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleExpand = (uuid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
      return next;
    });
  };

  // Group logs by date
  const groupedByDate = logs.reduce<Record<string, EventLog[]>>((acc, log) => {
    const date = new Date(log.created_at).toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric", weekday: "short",
    });
    (acc[date] ??= []).push(log);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ScrollText className="size-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">監査ログ</h2>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <Filter className="size-4 text-muted-foreground" />
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="エンティティ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">すべて</SelectItem>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{ENTITY_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="操作" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">すべて</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="relative">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">イベントログがありません</div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedByDate).map(([date, dateLogs]) => (
              <section key={date}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 sticky top-0 bg-background/80 backdrop-blur-sm py-1 z-10">
                  {date}
                </h3>
                <div className="relative ml-4 border-l-2 border-border/50 space-y-0">
                  {dateLogs.map((log) => (
                    <div key={log.uuid} className="relative pl-6 py-3 group hover:bg-accent/10 rounded-r-md transition-colors">
                      {/* Timeline dot */}
                      <div className="absolute left-[-5px] top-[18px] size-2 rounded-full bg-muted-foreground/50 group-hover:bg-primary transition-colors" />

                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {/* Time */}
                        <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">
                          {new Date(log.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>

                        {/* User */}
                        <span className="font-medium">{log.user_name}</span>

                        {/* Role badge */}
                        <Badge variant="outline" className={`text-xs py-0 ${ROLE_COLORS[log.user_role] ?? ""}`}>
                          {log.user_role}
                        </Badge>

                        {/* Action badge */}
                        <Badge variant="outline" className={`text-xs py-0 ${ACTION_COLORS[log.action] ?? ""}`}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </Badge>

                        {/* Entity type */}
                        <span className="text-muted-foreground">
                          {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                        </span>
                      </div>

                      {/* Summary */}
                      <div className="mt-1 ml-14 text-sm text-foreground/80">
                        {log.summary}
                      </div>

                      {/* Changes (expandable) */}
                      {log.changes && log.changes.length > 0 && (
                        <div className="mt-1 ml-14">
                          <button
                            onClick={() => toggleExpand(log.uuid)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          >
                            <ChevronRight className={`size-3 transition-transform ${expanded.has(log.uuid) ? "rotate-90" : ""}`} />
                            変更詳細 ({log.changes.length}件)
                          </button>
                          {expanded.has(log.uuid) && (
                            <div className="mt-2 space-y-1 text-xs">
                              {log.changes.map((ch, i) => (
                                <div key={i} className="flex items-center gap-2 text-muted-foreground font-mono">
                                  <span className="font-semibold text-foreground/70">{ch.field}</span>
                                  {ch.from !== undefined && (
                                    <span className="text-red-400/70 line-through">{String(ch.from)}</span>
                                  )}
                                  <span className="text-muted-foreground/50">&rarr;</span>
                                  {ch.to !== undefined && (
                                    <span className="text-green-400/70">{String(ch.to)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Source IP */}
                      {log.source_ip && (
                        <div className="mt-0.5 ml-14 text-xs text-muted-foreground/50 font-mono">
                          {log.source_ip}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Load more */}
        {cursor && !loading && (
          <div className="text-center mt-6">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              <ChevronDown className="size-4 mr-1" />
              {loadingMore ? "読み込み中..." : "さらに読み込む"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
