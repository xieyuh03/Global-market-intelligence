import MonetarySystemDashboard from "@/components/market/MonetarySystemDashboard";
import { publicAssetUrl } from "@/lib/data-source";
import type { MonetaryDashboardSnapshot } from "@/lib/monetary-system/model";
import snapshot from "../../../../public/data/monetary-system/dashboard.json";

export default function MonetarySystemPage() {
  return (
    <main className="mx-auto max-w-[1800px] px-3 pb-16 pt-28 sm:px-5 lg:px-8 xl:px-10">
      <MonetarySystemDashboard
        data={snapshot as MonetaryDashboardSnapshot}
        dataHref={publicAssetUrl("/data/monetary-system/dashboard.json")}
      />
    </main>
  );
}
