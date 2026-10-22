"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownToLine, BookOpenText } from "lucide-react";
import type {
  CountryCode,
  CountryMonetaryScore,
  MonetaryDashboardSnapshot,
  ScoreComponent,
} from "@/lib/monetary-system/model";

const STATE_COLORS: Record<CountryMonetaryScore["state"], string> = {
  "severe-shortage": "#5b8cc0",
  shortage: "#78a9d4",
  balanced: "#68b995",
  excess: "#d6a65d",
  "severe-excess": "#e16f64",
};

function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function pct(value: number, digits = 1) {
  return `${signed(value, digits)}%`;
}

function ScoreGauge({ country }: { country: CountryMonetaryScore }) {
  const markerPosition = ((country.score + 100) / 200) * 100;
  const color = STATE_COLORS[country.state];

  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-gradient-to-r from-[#5b8cc0] via-[#68b995] to-[#e16f64]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/60" />
        <div
          className="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.75)]"
          style={{ left: `${markerPosition}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-gray-500">
        <span>-100 货币不足</span>
        <span>0 匹配</span>
        <span>+100 货币过量</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-5xl leading-none" style={{ color }}>{signed(country.score)}</p>
          <p className="mt-2 text-sm text-gray-300">{country.stateLabel}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl text-white">{country.matchScore.toFixed(1)}</p>
          <p className="mt-1 text-xs text-gray-500">匹配度 / 100</p>
        </div>
      </div>
    </div>
  );
}

function CountryCard({
  country,
  active,
  onClick,
}: {
  country: CountryMonetaryScore;
  active: boolean;
  onClick: () => void;
}) {
  const color = STATE_COLORS[country.state];
  return (
    <button
      type="button"
      onClick={onClick}
      className="border p-5 text-left transition-colors"
      style={{
        borderColor: active ? `${color}99` : "rgba(255,255,255,0.1)",
        background: active ? `${color}12` : "rgba(255,255,255,0.025)",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{country.currency}体系</p>
          <h2 className="mt-2 text-2xl text-white">{country.name}</h2>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl" style={{ color }}>{signed(country.score)}</p>
          <p className="mt-1 text-[10px] text-gray-500">数据截至 {country.asOf}</p>
        </div>
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full" style={{ width: `${country.matchScore}%`, background: color }} />
      </div>
      <p className="mt-4 text-xs leading-5 text-gray-400">{country.summary}</p>
    </button>
  );
}

function ContributionBar({ component }: { component: ScoreComponent }) {
  const positive = component.contribution >= 0;
  const width = Math.min(50, Math.abs(component.contribution) / 2);
  return (
    <div className="border-b border-white/[0.07] py-4 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-white">{component.label}</p>
          <p className="mt-1 text-[10px] text-gray-500">
            权重 {(component.weight * 100).toFixed(0)}% · 原始分 {signed(component.score)}
          </p>
        </div>
        <p className="font-mono text-lg" style={{ color: positive ? "#d6a65d" : "#78a9d4" }}>
          {signed(component.contribution)}
        </p>
      </div>
      <div className="relative mt-3 h-2 bg-white/[0.04]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <div
          className="absolute inset-y-0"
          style={{
            width: `${width}%`,
            left: positive ? "50%" : `${50 - width}%`,
            background: positive ? "#d6a65d" : "#78a9d4",
          }}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-gray-500">{component.explanation}</p>
    </div>
  );
}

export default function MonetarySystemDashboard({
  data,
  dataHref,
  noteHref,
}: {
  data: MonetaryDashboardSnapshot;
  dataHref: string;
  noteHref?: string;
}) {
  const [countryCode, setCountryCode] = useState<CountryCode>("US");
  const country = data.countries.find((item) => item.code === countryCode) ?? data.countries[0];
  const chartData = country.history.filter((item) => item.gapPct != null);

  return (
    <div className="page-enter">
      <header className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px w-8 bg-[#d49a54]/70" />
          <span className="text-xs uppercase tracking-[0.2em] text-[#a97841]">Currency Carrying Capacity</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-4xl font-bold text-white xl:text-5xl">中美货币承载力</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
              只回答一个问题：流通中的货币，相对于使用这种货币的市场所能提供的真实生产和交易，是偏多、匹配，还是偏少。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {noteHref && (
              <Link href={noteHref} className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5">
                <BookOpenText size={15} />查看核心笔记
              </Link>
            )}
            <a href={dataHref} download className="flex h-10 items-center gap-2 border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5">
              <ArrowDownToLine size={15} />下载模型数据
            </a>
          </div>
        </div>
      </header>

      <section className="mb-8 grid gap-px overflow-hidden border border-white/10 bg-white/10 lg:grid-cols-3" aria-label="计算主线">
        {[
          ["01", "货币与生产", "广义货币增速减去实际GDP增速，判断购买凭证是否跑在真实生产前面。"],
          ["02", "货币流通", "当期价格GDP除以广义货币，判断每单位货币实际支撑了多少年产出。"],
          ["03", "市场边界", "观察这种货币的国际使用范围是在扩大还是缩小，修正它能覆盖的市场。"],
        ].map(([step, title, text]) => (
          <div key={step} className="bg-[#111619] p-5">
            <p className="font-mono text-[10px] text-[#d49a54]">{step}</p>
            <p className="mt-3 text-sm text-white">{title}</p>
            <p className="mt-2 text-xs leading-5 text-gray-500">{text}</p>
          </div>
        ))}
      </section>

      <section className="mb-8 grid gap-3 md:grid-cols-2" aria-label="中美总分">
        {data.countries.map((item) => (
          <CountryCard
            key={item.code}
            country={item}
            active={item.code === country.code}
            onClick={() => setCountryCode(item.code)}
          />
        ))}
      </section>

      <section className="mb-8 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="border border-white/10 bg-[#111619] p-5 sm:p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{country.currency}总分</p>
              <h2 className="mt-2 text-2xl text-white">货币承载偏差</h2>
            </div>
            <span className="border border-white/10 px-2.5 py-1 text-[10px] text-gray-500">截至 {country.asOf}</span>
          </div>
          <ScoreGauge country={country} />
          <p className="mt-6 border-t border-white/[0.07] pt-5 text-sm leading-6 text-gray-400">{country.summary}</p>
        </div>

        <div className="border border-white/10 bg-[#111619] p-5 sm:p-6">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Contribution</p>
              <h2 className="mt-2 text-2xl text-white">总分贡献拆解</h2>
            </div>
            <p className="font-mono text-2xl text-white">{signed(country.score)}</p>
          </div>
          {country.components.map((component) => (
            <ContributionBar key={component.id} component={component} />
          ))}
        </div>
      </section>

      <section className="mb-8 border border-white/10 bg-[#111619] p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Supply Gap</p>
          <h2 className="mt-2 text-2xl text-white">货币增速与真实生产增速</h2>
          <p className="mt-2 text-xs leading-5 text-gray-500">黄色为广义货币增速，绿色为实际GDP增速，红色为两者之差。</p>
        </div>
        <div className="h-[330px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="year" stroke="#727d86" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis stroke="#727d86" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => `${value}%`} />
              <Tooltip
                contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12 }}
                labelStyle={{ color: "#fff" }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
              <Line name="广义货币增速" type="monotone" dataKey="moneyGrowthPct" stroke="#d6a65d" dot={false} strokeWidth={2} />
              <Line name="实际GDP增速" type="monotone" dataKey="realOutputGrowthPct" stroke="#68b995" dot={false} strokeWidth={2} />
              <Line name="货币-生产差" type="monotone" dataKey="gapPct" stroke="#e16f64" dot={false} strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mb-8 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="border border-white/10 bg-[#111619] p-5 sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Time Horizons</p>
          <h2 className="mt-2 text-2xl text-white">三个周期怎么算</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <thead className="border-b border-white/10 text-[10px] text-gray-500">
                <tr>
                  <th className="py-2 text-left font-medium">周期</th>
                  <th className="py-2 text-right font-medium">货币</th>
                  <th className="py-2 text-right font-medium">生产</th>
                  <th className="py-2 text-right font-medium">偏差</th>
                  <th className="py-2 text-right font-medium">权重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {country.horizons.map((item) => (
                  <tr key={item.years}>
                    <td className="py-3 text-gray-300">{item.years}年</td>
                    <td className="py-3 text-right font-mono text-gray-300">{pct(item.moneyGrowthPct)}</td>
                    <td className="py-3 text-right font-mono text-gray-300">{pct(item.realOutputGrowthPct)}</td>
                    <td className="py-3 text-right font-mono" style={{ color: item.gapPct >= 0 ? "#d6a65d" : "#78a9d4" }}>{pct(item.gapPct)}</td>
                    <td className="py-3 text-right font-mono text-gray-500">{(item.weight * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 border-t border-white/[0.07] pt-4 text-xs text-gray-500">
            加权偏差 <span className="font-mono text-white">{pct(country.weightedGapPct, 2)}</span>
            ，进入总分前换算为 <span className="font-mono text-white">{signed(country.components[0].score)}</span> 分。
          </div>
        </div>

        <div className="border border-white/10 bg-[#111619] p-5 sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Causal Boundary</p>
          <h2 className="mt-2 text-2xl text-white">哪些数据不进入总分</h2>
          <p className="mt-4 text-sm leading-6 text-gray-400">
            物价、房价、股票、汇率、黄金和长期利率是结果，只负责验证多余或不足的货币去了哪里。把结果重新加进总分，会变成用结果证明原因。
          </p>
          <div className="mt-5 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2">
            {[
              ["商品上涨、本币下跌", "多余货币已进入商品和外汇"],
              ["商品稳定、资产上涨", "多余货币主要进入资产"],
              ["商品资产都弱、存款增长", "多余货币主要沉淀在账户和债务体系"],
              ["总分为负、物价交易下降", "货币不足或货币不愿流通"],
            ].map(([signal, conclusion]) => (
              <div key={signal} className="bg-[#0d1215] p-4">
                <p className="text-xs text-gray-300">{signal}</p>
                <p className="mt-2 text-[11px] leading-5 text-gray-500">{conclusion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 py-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-xs text-gray-400">数据与精度</p>
            <p className="mt-2 text-xs leading-6 text-gray-600">
              广义货币和GDP采用世界银行统一年度口径。国际使用指数来自美联储2025年报告，历史参考值为图表近似值，因此边界项只能判断方向，不能解读为实时精确测量。
            </p>
          </div>
          <div className="grid gap-2">
            {data.sources.map((source) => (
              <a key={source.name} href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-4 text-xs text-gray-500 hover:text-gray-300">
                <span>{source.organization} · {source.name}</span>
                <span className="text-right text-[10px] text-gray-600">{source.note}</span>
              </a>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[10px] text-gray-700">快照生成于 {new Date(data.generatedAt).toLocaleString("zh-CN")} · 模型 {data.methodology.version}</p>
      </section>
    </div>
  );
}
