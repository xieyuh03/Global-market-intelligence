import { ArrowDownToLine } from "lucide-react";
import DeviationDashboard, { type DeviationStatistics } from "@/components/market/DeviationDashboard";
import { publicAssetUrl } from "@/lib/data-source";
import statistics from "../../../../public/data/deviation-analysis/statistics.json";

const DATA_BASE = publicAssetUrl("/data/deviation-analysis");

export default function DeviationPage() {
  return (
    <div className="pb-16 pt-2">
      <header className="mb-6">
        <div className="mb-4 flex items-center gap-3"><div className="h-px w-8 bg-white/20" /><span className="text-xs uppercase tracking-[0.2em] text-gray-500">Log Deviation</span></div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-4xl font-bold text-white xl:text-5xl">均线对数偏离度</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">指数走势与偏离度上下联动，用固定阈值或历史分位识别趋势过热、超跌与回归区间。</p></div>
          <a href={`${DATA_BASE}/statistics.json`} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5"><ArrowDownToLine size={15} />下载概率统计</a>
        </div>
      </header>
      <DeviationDashboard data={statistics as DeviationStatistics} dataBase={DATA_BASE} />
      <div className="mt-8 border-y border-white/10 py-4 text-xs leading-6 text-gray-500">历史频率不是预测保证。未来窗口互相重叠，概率用于识别位置与风险，不单独构成交易信号。</div>
    </div>
  );
}