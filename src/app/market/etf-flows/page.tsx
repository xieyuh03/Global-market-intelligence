import { ArrowDownToLine } from "lucide-react";
import BroadEtfFlowDashboard, { type BroadEtfFlowData } from "@/components/market/BroadEtfFlowDashboard";
import { publicAssetUrl } from "@/lib/data-source";
import flowData from "../../../../public/data/etf-flow/broad-etf-flow.json";

const DATA_BASE = publicAssetUrl("/data/etf-flow");

export default function BroadEtfFlowPage() {
  return (
    <div className="pb-16 pt-2">
      <header className="mb-8">
        <div className="mb-4 flex items-center gap-3"><div className="h-px w-8 bg-white/20" /><span className="text-xs uppercase tracking-[0.2em] text-gray-500">Broad ETF Flow</span></div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white xl:text-5xl">宽基 ETF 流入流出</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">基于沪深交易所每日基金份额变化，剥离价格涨跌后估算一级市场净申购与净赎回。</p>
          </div>
          <div className="flex gap-2">
            <a href={`${DATA_BASE}/daily.csv`} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5"><ArrowDownToLine size={15} />日汇总 CSV</a>
            <a href={`${DATA_BASE}/fund-daily.csv`} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5"><ArrowDownToLine size={15} />逐只明细</a>
          </div>
        </div>
      </header>
      <BroadEtfFlowDashboard data={flowData as BroadEtfFlowData} />
    </div>
  );
}