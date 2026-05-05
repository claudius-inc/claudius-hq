import { redirect } from "next/navigation";

interface PageProps {
  params: { ticker: string };
  searchParams: { report?: string };
}

export const dynamic = "force-dynamic";

export default function ResearchTickerRedirect({
  params,
  searchParams,
}: PageProps) {
  const ticker = encodeURIComponent(params.ticker);
  const qs = searchParams.report
    ? `?report=${encodeURIComponent(searchParams.report)}`
    : "";
  redirect(`/markets/ticker/${ticker}${qs}`);
}
