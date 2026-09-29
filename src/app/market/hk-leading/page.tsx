import { ArrowDownToLine } from "lucide-react";
import HkLeadingIndicatorDashboard, { type HkLeadingIndicatorData } from "@/components/market/HkLeadingIndicatorDashboard";
import { publicAssetUrl, publicSnapshotMode } from "@/lib/data-source";
import indicatorData from "../../../../public/data/hk-leading-indicator/summary.json";

const DATA_BASE = publicAssetUrl("/data/hk-leading-indicator");

export default function HkLeadingIndicatorPage() {
  return (
    <div className={publicSnapshotMode ? "pb-16 pt-24" : "pb-16 pt-2"}>
      <header className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px w-8 bg-white/20" />
          <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Hong Kong Leading Composite</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white xl:text-5xl">恒生指数领航指标</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
              香港 M2、内地 PPI、内地社零与社融流量强度各占 25%，按发布月对齐后做最长36个月滚动标准化，用于研究月度宏观状态与港股中期方向。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`${DATA_BASE}/components.csv`} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5">
              <ArrowDownToLine size={15} />
              因子全量 CSV
            </a>
            <a href={`${DATA_BASE}/monthly.csv`} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5">
              <ArrowDownToLine size={15} />
              模型月表 CSV
            </a>
            <a href={`${DATA_BASE}/summary.json`} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5">
              <ArrowDownToLine size={15} />
              模型 JSON
            </a>
          </div>
        </div>
      </header>

      <section className="mb-8 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4" aria-label="因子权重">
        {[
          ["25%", "香港 M2 总额同比", "本地货币与存款流动性"],
          ["25%", "内地 PPI 同比", "企业利润与名义增长环境"],
          ["25%", "内地社零同比", "内需与消费景气"],
          ["25%", "信用脉冲代理", "6个月新增社融 ÷ 最近两个季度名义 GDP"],
        ].map(([weight, label, description]) => (
          <div key={label} className="bg-[#111619] p-4">
            <p className="font-mono text-sm text-[#d49a54]">{weight}</p>
            <p className="mt-2 text-sm text-white">{label}</p>
            <p className="mt-2 text-xs leading-5 text-gray-500">{description}</p>
          </div>
        ))}
      </section>

      <HkLeadingIndicatorDashboard data={indicatorData as HkLeadingIndicatorData} />

      <div className="mt-8 border-y border-white/10 py-4 text-xs leading-6 text-gray-500">
        本页按近似发布月对齐，但历史宏观值仍是最新修订版，不等于完整的 vintage 实时数据库。当前样本的前瞻相关较弱，拐点配对和相似样本只用于提出情景，不构成已证实的领先关系或交易信号。
      </div>
    </div>
  );
}
