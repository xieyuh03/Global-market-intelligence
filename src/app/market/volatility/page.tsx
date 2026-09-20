import Image from "next/image";
import { ArrowDownToLine, Database, Gauge, Sigma } from "lucide-react";
import Card from "@/components/ui/Card";
import { publicAssetUrl } from "@/lib/data-source";
import analysis from "../../../../public/data/volatility-analysis/summary.json";

const DATA_BASE = publicAssetUrl("/data/volatility-analysis");

function pct(value: number | null, digits = 2) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function correlation(value: number | null) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

function tone(value: number | null, inverse = false) {
  if (value == null) return "#aab4be";
  const positive = inverse ? value < 0 : value > 0;
  return positive ? "#55a8a1" : value === 0 ? "#aab4be" : "#d49a54";
}

export default function VolatilityAnalysisPage() {
  const indices = analysis.indices;

  return (
    <div className="pb-16 pt-2">
      <header className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px w-8 bg-white/20" />
          <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Volatility Research</span>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold text-white xl:text-5xl">波动率 × 收益率</h1>
            <p className="mt-3 text-sm text-gray-400">四大指数全量日线 · 公平比较期 2005-01-04 至 {analysis.manifest.quality[0].lastDate}</p>
          </div>
          <a
            href={`${DATA_BASE}/summary.json`}
            download
            className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5"
          >
            <ArrowDownToLine size={15} />下载统计 JSON
          </a>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4" aria-label="核心结论">
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">完整数据</p><p className="mt-2 text-2xl font-semibold text-white">52,822 日</p><p className="mt-2 text-xs text-gray-500">四指数原始 OHLCV 全量记录</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">不对称波动</p><p className="mt-2 text-2xl font-semibold text-[#55a8a1]">4 / 4</p><p className="mt-2 text-xs text-gray-500">收益越低，随后20日波动越高</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">收益预测力</p><p className="mt-2 text-2xl font-semibold text-[#d49a54]">R² &lt; 1%</p><p className="mt-2 text-xs text-gray-500">当前波动率无法单独解释未来收益</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">数据质量</p><p className="mt-2 text-2xl font-semibold text-[#55a8a1]">0 异常</p><p className="mt-2 text-xs text-gray-500">OHLC 校验无丢弃记录</p></div>
      </section>

      <section className="mt-8" aria-label="比较统计">
        <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Comparable sample</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">统一样本比较</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">均从沪深300起始日开始，收益为价格指数对数收益，不含股息。</p>
          </div>
          <span className="text-[10px] text-gray-500">波动率均按 √252 年化</span>
        </div>
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-xs">
              <thead className="border-b border-white/10 bg-white/[0.025] text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">指数</th>
                  <th className="px-3 py-3 text-right font-medium">样本日</th>
                  <th className="px-3 py-3 text-right font-medium">年化收益</th>
                  <th className="px-3 py-3 text-right font-medium">年化波动</th>
                  <th className="px-3 py-3 text-right font-medium">收益 → 未来波动</th>
                  <th className="px-3 py-3 text-right font-medium">波动 → 未来收益</th>
                  <th className="px-3 py-3 text-right font-medium">回归 R²</th>
                  <th className="px-3 py-3 text-right font-medium">负冲击后波动</th>
                  <th className="px-4 py-3 text-right font-medium">正冲击后波动</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {indices.map((index) => {
                  const comparable = index.comparableSince2005;
                  return (
                    <tr key={index.id} className="hover:bg-white/[0.025]">
                      <td className="px-4 py-3"><p className="text-gray-200">{index.name}</p><p className="mt-1 text-[10px] text-gray-600">{index.source} · {index.firstDate} 起</p></td>
                      <td className="px-3 py-3 text-right font-mono text-gray-400">{comparable.observations.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: tone(comparable.annualizedReturnPct) }}>{pct(comparable.annualizedReturnPct)}</td>
                      <td className="px-3 py-3 text-right font-mono text-gray-300">{pct(comparable.annualizedVolatilityPct)}</td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: tone(comparable.returnFutureVolatilityCorrelation, true) }}>{correlation(comparable.returnFutureVolatilityCorrelation)}</td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: tone(comparable.volatilityForward20ReturnCorrelation) }}>{correlation(comparable.volatilityForward20ReturnCorrelation)}</td>
                      <td className="px-3 py-3 text-right font-mono text-gray-400">{pct(comparable.forward20Regression.rSquared * 100, 3)}</td>
                      <td className="px-3 py-3 text-right font-mono text-[#d49a54]">{pct(comparable.shockAnalysis.averageForwardVol20AfterNegativeShockPct)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#55a8a1]">{pct(comparable.shockAnalysis.averageForwardVol20AfterPositiveShockPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3" aria-label="研究结论">
        <Card padding="md">
          <div className="mb-3 flex items-center gap-2 text-gray-400"><Gauge size={15} /><span className="text-xs">波动不对称</span></div>
          <p className="text-sm leading-6 text-gray-300">四个市场中，当日收益越低，随后20日实现波动率越高。美国相关系数约 -0.125，A股约 -0.04 至 -0.05。</p>
        </Card>
        <Card padding="md">
          <div className="mb-3 flex items-center gap-2 text-gray-400"><Sigma size={15} /><span className="text-xs">预测边界</span></div>
          <p className="text-sm leading-6 text-gray-300">波动率对未来20日收益的线性解释力均不足 1%。波动率适合衡量风险状态，不适合作为独立方向信号。</p>
        </Card>
        <Card padding="md">
          <div className="mb-3 flex items-center gap-2 text-gray-400"><Database size={15} /><span className="text-xs">中美差异</span></div>
          <p className="text-sm leading-6 text-gray-300">A股最高波动组随后收益低于最低波动组；美国不存在稳定单调关系，风险补偿会被危机反弹与长期趋势共同影响。</p>
        </Card>
      </section>

      <section className="mt-8" aria-label="波动率分组图">
        <Card padding="md" className="overflow-hidden">
          <h2 className="text-lg font-semibold text-white">波动率五分位与未来20日收益</h2>
          <p className="mt-2 text-xs text-gray-500">同一指数内部按20日实现波动率分为五组；柱高为随后20个交易日平均对数收益。</p>
          <Image src={`${DATA_BASE}/charts/volatility-quintiles.svg`} width={1100} height={520} alt="四个指数的波动率五分位与未来20日平均收益" className="mt-4 h-auto w-full" loading="eager" unoptimized />
        </Card>
      </section>

      <section className="mt-8 space-y-6" aria-label="指数详细图表">
        {indices.map((index) => (
          <Card key={index.id} padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 flex-wrap">
              <div><h2 className="text-lg font-semibold text-white">{index.name}</h2><p className="mt-1 text-[10px] text-gray-600">{index.firstDate} 至 {index.lastDate} · {index.observations.toLocaleString()} 条</p></div>
              <div className="flex gap-2">
                <a href={`${DATA_BASE}/raw/${index.id}.csv`} download className="rounded border border-white/10 px-2.5 py-1.5 text-[10px] text-gray-400 hover:bg-white/5">原始 CSV</a>
                <a href={`${DATA_BASE}/derived/${index.id}.csv`} download className="rounded border border-white/10 px-2.5 py-1.5 text-[10px] text-gray-400 hover:bg-white/5">指标 CSV</a>
              </div>
            </div>
            <div className="grid gap-px bg-white/[0.08] xl:grid-cols-[1.25fr_0.75fr]">
              <div className="bg-[#0d1215] p-3"><Image src={`${DATA_BASE}/charts/${index.id}-timeseries.svg`} width={1280} height={520} alt={`${index.name}指数和实现波动率历史`} className="h-auto w-full" loading="eager" unoptimized /></div>
              <div className="bg-[#0d1215] p-3"><Image src={`${DATA_BASE}/charts/${index.id}-scatter.svg`} width={800} height={540} alt={`${index.name}波动率与未来收益散点图`} className="h-auto w-full" loading="eager" unoptimized /></div>
            </div>
          </Card>
        ))}
      </section>

      <div className="mt-8 border-y border-white/10 py-4 text-xs leading-6 text-gray-500">
        <p><b className="text-gray-300">数据口径：</b>美股来自 Yahoo Finance，并以 FRED 最近500个重叠交易日核验；A股来自东方财富完整日线。价格指数收益不含股息。</p>
        <p><b className="text-gray-300">统计边界：</b>未来收益窗口彼此重叠，因此相关系数和 $R^2$ 用于描述，不作为独立显著性检验或交易建议。</p>
      </div>
    </div>
  );
}