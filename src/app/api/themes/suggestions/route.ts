import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Pre-built theme mappings for common investment themes
const THEME_MAPPINGS: Record<string, { tickers: string[]; description: string }> = {
  // Energy & Resources
  "nuclear": { tickers: ["CCJ", "URA", "LEU", "NNE", "OKLO", "SMR"], description: "Nuclear energy and uranium" },
  "uranium": { tickers: ["CCJ", "URA", "DNN", "UEC", "UUUU", "NXE"], description: "Uranium miners and ETFs" },
  "solar": { tickers: ["ENPH", "SEDG", "FSLR", "RUN", "NOVA", "TAN"], description: "Solar energy companies" },
  "oil": { tickers: ["XOM", "CVX", "OXY", "COP", "SLB", "HAL"], description: "Oil & gas majors" },
  "clean energy": { tickers: ["ENPH", "PLUG", "FSLR", "BE", "SEDG", "ICLN"], description: "Clean/renewable energy" },
  "lithium": { tickers: ["ALB", "SQM", "LTHM", "LAC", "PLL", "LIT"], description: "Lithium miners and battery materials" },
  "copper": { tickers: ["FCX", "SCCO", "TECK", "COPX", "HBM", "ERII"], description: "Copper miners" },
  "gold": { tickers: ["GLD", "NEM", "GOLD", "AEM", "WPM", "GDX"], description: "Gold miners and ETFs" },
  
  // Technology
  "ai": { tickers: ["NVDA", "AMD", "MSFT", "GOOGL", "META", "TSM"], description: "AI infrastructure and leaders" },
  "ai infrastructure": { tickers: ["NVDA", "AMD", "TSM", "AVGO", "MRVL", "SMCI"], description: "AI chips and infrastructure" },
  "semiconductors": { tickers: ["NVDA", "AMD", "INTC", "TSM", "AVGO", "QCOM"], description: "Semiconductor companies" },
  "quantum": { tickers: ["IONQ", "RGTI", "QBTS", "IBM", "GOOGL", "HON"], description: "Quantum computing" },
  "cybersecurity": { tickers: ["CRWD", "PANW", "ZS", "FTNT", "S", "OKTA"], description: "Cybersecurity companies" },
  "cloud": { tickers: ["AMZN", "MSFT", "GOOGL", "SNOW", "MDB", "NET"], description: "Cloud computing" },
  "saas": { tickers: ["CRM", "NOW", "WDAY", "ZM", "DDOG", "TEAM"], description: "Software as a service" },
  
  // Regional
  "china tech": { tickers: ["BABA", "JD", "PDD", "BIDU", "TCEHY", "NTES"], description: "Chinese tech giants" },
  "china ev": { tickers: ["BYD", "NIO", "XPEV", "LI", "BYDDY", "KNDI"], description: "Chinese EV makers" },
  "india": { tickers: ["INDA", "INFY", "WIT", "IBN", "HDB", "TTM"], description: "Indian stocks" },
  "japan": { tickers: ["EWJ", "TM", "SONY", "NTT", "MUFG", "SMFG"], description: "Japanese companies" },
  "korea": { tickers: ["EWY", "005930.KS", "000660.KS", "035420.KS", "051910.KS"], description: "Korean companies" },
  
  // Sectors
  "defense": { tickers: ["LMT", "RTX", "NOC", "GD", "BA", "LHX"], description: "Defense contractors" },
  "aerospace": { tickers: ["BA", "LMT", "RTX", "GE", "HWM", "TDG"], description: "Aerospace companies" },
  "ev": { tickers: ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI"], description: "Electric vehicle makers" },
  "fintech": { tickers: ["SQ", "PYPL", "AFRM", "COIN", "HOOD", "SOFI"], description: "Financial technology" },
  "crypto": { tickers: ["COIN", "MSTR", "RIOT", "MARA", "CLSK", "BITF"], description: "Crypto-related stocks" },
  "biotech": { tickers: ["AMGN", "GILD", "BIIB", "REGN", "VRTX", "MRNA"], description: "Biotechnology" },
  "healthcare": { tickers: ["UNH", "JNJ", "PFE", "MRK", "ABBV", "LLY"], description: "Healthcare companies" },
  "banks": { tickers: ["JPM", "BAC", "WFC", "C", "GS", "MS"], description: "Major banks" },
  "retail": { tickers: ["AMZN", "WMT", "COST", "TGT", "HD", "LOW"], description: "Retail giants" },
  "reshoring": { tickers: ["DE", "CAT", "URI", "EMR", "ROK", "ETN"], description: "US manufacturing/reshoring" },
  "robotics": { tickers: ["ISRG", "ROK", "ABB", "FANUY", "IRBT", "PATH"], description: "Robotics and automation" },
  "space": { tickers: ["RKLB", "SPCE", "ASTS", "LUNR", "RDW", "MNTS"], description: "Space exploration" },
  
  // Themes
  "dividend": { tickers: ["VYM", "SCHD", "O", "JNJ", "PG", "KO"], description: "High dividend stocks" },
  "growth": { tickers: ["NVDA", "TSLA", "AMZN", "GOOGL", "META", "NFLX"], description: "High growth stocks" },
  "value": { tickers: ["BRK.B", "JPM", "JNJ", "PG", "WMT", "XOM"], description: "Value stocks" },
  "mag7": { tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"], description: "Magnificent 7" },
};

// GET /api/themes/suggestions?name=nuclear or ?tickers=NVDA,AMD
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.toLowerCase().trim();
  const tickers = searchParams.get("tickers");

  try {
    // If name provided, try to match a theme
    if (name) {
      // Try exact match first
      if (THEME_MAPPINGS[name]) {
        return NextResponse.json({
          matched: true,
          theme: name,
          suggestions: THEME_MAPPINGS[name].tickers,
          description: THEME_MAPPINGS[name].description,
        });
      }

      // Try partial match
      const matches = Object.entries(THEME_MAPPINGS).filter(([key]) =>
        key.includes(name) || name.includes(key)
      );

      if (matches.length > 0) {
        const [matchedKey, matchedValue] = matches[0];
        return NextResponse.json({
          matched: true,
          theme: matchedKey,
          suggestions: matchedValue.tickers,
          description: matchedValue.description,
        });
      }

      // No match found
      return NextResponse.json({
        matched: false,
        theme: name,
        suggestions: [],
        description: null,
      });
    }

    // If tickers provided, get related stocks from Yahoo Finance
    if (tickers) {
      const tickerList = tickers.split(",").map((t) => t.trim().toUpperCase());
      const allSuggestions: Map<string, number> = new Map();

      // Get recommendations for each ticker
      for (const ticker of tickerList.slice(0, 5)) { // Limit to 5 to avoid rate limiting
        try {
          const recs = await yahooFinance.recommendationsBySymbol(ticker);
          if (recs?.recommendedSymbols) {
            for (const rec of recs.recommendedSymbols) {
              if (!tickerList.includes(rec.symbol)) {
                const current = allSuggestions.get(rec.symbol) || 0;
                allSuggestions.set(rec.symbol, current + rec.score);
              }
            }
          }
        } catch {
          // Skip failed lookups
        }
      }

      // Sort by score and take top 10
      const sorted = Array.from(allSuggestions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ticker]) => ticker);

      // Fetch names for suggested tickers (parallel, best-effort)
      const suggestionsWithNames = await Promise.all(
        sorted.map(async (ticker) => {
          try {
            const q = await yahooFinance.quote(ticker) as { shortName?: string };
            return { ticker, name: q?.shortName || undefined };
          } catch {
            return { ticker };
          }
        })
      );

      return NextResponse.json({
        suggestions: suggestionsWithNames,
        basedOn: tickerList,
      });
    }

    // Return list of available themes
    const availableThemes = Object.entries(THEME_MAPPINGS).map(([name, data]) => ({
      name,
      description: data.description,
      stockCount: data.tickers.length,
    }));

    return NextResponse.json({ themes: availableThemes });
  } catch (e) {
    console.error("Failed to get suggestions:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
