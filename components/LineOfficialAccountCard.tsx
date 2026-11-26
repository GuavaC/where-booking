'use client';

type LineOfficialAccountCardProps = {
  title?: string;
  description: string;
  compact?: boolean;
};

export default function LineOfficialAccountCard({
  title = '🔔 開啟 LINE 即時通知',
  description,
  compact = false,
}: LineOfficialAccountCardProps) {
  const rawId = process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID?.trim() || '';
  const normalizedId = rawId ? (rawId.startsWith('@') ? rawId : `@${rawId}`) : '';
  const addFriendUrl = normalizedId
    ? `https://line.me/R/ti/p/${encodeURIComponent(normalizedId)}`
    : '';

  return (
    <div
      className={`rounded-xl border border-emerald-200 bg-emerald-50/80 ${
        compact ? 'p-3 space-y-2' : 'p-4 space-y-2.5'
      }`}
    >
      <div className="space-y-1">
        <p className="text-xs font-bold text-emerald-950">{title}</p>
        <p className="text-[11px] leading-relaxed text-emerald-900/90">{description}</p>
      </div>

      {addFriendUrl ? (
        <a
          href={addFriendUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#06C755] px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#05b34c]"
        >
          <span>＋ 點此加入通知官方帳號</span>
          {normalizedId && <span className="font-mono text-[11px] opacity-95">({normalizedId})</span>}
        </a>
      ) : (
        <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 text-[11px] text-emerald-900">
          請在 LINE 搜尋「<strong>WhereBooking 通知中心</strong>」並加入好友，確保通知正常送達。
        </div>
      )}
    </div>
  );
}