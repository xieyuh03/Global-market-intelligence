import GlobalSituationWorkspace from "@/components/global/GlobalSituationWorkspace";

export default function Home() {
  return (
    <main className="min-h-screen pt-28 text-sm sm:pt-32">
      <div className="mx-auto max-w-[1800px] px-3 sm:px-5 lg:px-8 xl:px-10">
        <GlobalSituationWorkspace />
      </div>
    </main>
  );
}
