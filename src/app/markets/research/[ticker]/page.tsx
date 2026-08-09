import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ report?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ResearchTickerRedirect(props: PageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const ticker = encodeURIComponent(params.ticker);
  const qs = searchParams.report
    ? `?report=${encodeURIComponent(searchParams.report)}`
    : "";
  redirect(`/markets/ticker/${ticker}${qs}`);
}
