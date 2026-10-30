import { METRIC_LABEL, MetricName } from "@/lib/api";

/** Small matrix heatmap for metric-vs-metric comparisons (values 0..1). */
export default function Heatmap({ data, keys }: { data: Record<string, Record<string, number>>; keys: string[] }) {
  const color = (v: number) => `rgba(37, 99, 235, ${Math.max(0.06, Math.min(1, v))})`;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th />
            {keys.map((k) => <th key={k} className="px-1 pb-2 font-medium text-slate-500">{METRIC_LABEL[k as MetricName] ?? k}</th>)}
          </tr>
        </thead>
        <tbody>
          {keys.map((r) => (
            <tr key={r}>
              <th className="pr-2 text-right font-medium text-slate-500">{METRIC_LABEL[r as MetricName] ?? r}</th>
              {keys.map((c) => {
                const v = data[c]?.[r] ?? 0;
                return (
                  <td key={c} className={`h-11 w-16 text-center font-mono ${v > 0.55 ? "text-white" : "text-slate-800"}`} style={{ background: color(v) }}>
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
