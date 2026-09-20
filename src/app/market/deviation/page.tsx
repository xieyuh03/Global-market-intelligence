import { ArrowDownToLine } from "lucide-react";
import DeviationDashboard, { type DeviationStatistics } from "@/components/market/DeviationDashboard";
import { publicAssetUrl } from "@/lib/data-source";
import statistics from "../../../../public/data/deviation-analysis/statistics.json";

const DATA_BASE = publicAssetUrl("/data/deviation-analysis");

export default function DeviationPage() {
  return (
    <div className="pb-16 pt-2">
      <header className="mb-8">
        <div className="mb-4 flex items-center gap-3"><div className="h-px w-8 bg-white/20" /><span className="text-xs uppercase tracking-[0.2em] text-gray-500">Log Deviation</span></div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-4xl font-bold text-white xl:text-5xl">均线对数偏离度</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">每日计算指数相对60日、200日简单均线的对数距离，并用分段历史频率评估短期反弹与回撤。</p></div>
          <a href={`${DATA_BASE}/statistics.json`} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5"><ArrowDownToLine size={15} />下载概率统计</a>
        </div>
      </header>
      <section className="mb-8 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-3" aria-label="指标口径">
        <div className="bg-[#111619] p-4"><p className="text-[10px] text-gray-500">对数偏离度</p><p className="mt-2 font-mono text-sm text-white">100 × ln(收盘 / 均线)</p><p className="mt-2 text-xs leading-5 text-gray-500">正值在均线上方，负值在均线下方。</p></div>
        <div className="bg-[#111619] p-4"><p className="text-[10px] text-gray-500">抄底参考</p><p className="mt-2 text-sm text-white">历史最低 1% / 5% / 10%</p><p className="mt-2 text-xs leading-5 text-gray-500">统计随后5、20、60个交易日上涨频率。</p></div>
        <div className="bg-[#111619] p-4"><p className="text-[10px] text-gray-500">逃顶参考</p><p className="mt-2 text-sm text-white">历史最高 10% / 5% / 1%</p><p className="mt-2 text-xs leading-5 text-gray-500">统计随后5、20、60个交易日下跌频率。</p></div>
      </section>
      <DeviationDashboard data={statistics as DeviationStatistics} dataBase={DATA_BASE} />
      <div className="mt-8 border-y border-white/10 py-4 text-xs leading-6 text-gray-500">历史频率不是预测保证。未来窗口互相重叠，概率用于识别位置与风险，不单独构成交易信号。</div>
    </div>
  );
}