import YahooFinance from "yahoo-finance2";
import { logger } from "./logger";
import {
  CrowdingLevel,
  getLevel,
  getCrowdingDescription,
  getCrowdingColor,
  getCrowdingBgColor,
} from "./crowding-utils";

// Re-export client-safe utilities
export type { CrowdingLevel };
export {
  getCrowdingDescription,
  getCrowdingColor,
  getCrowdingBgColor,
  getLevel,
};

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface CrowdingScore {
  score: number;
  level: CrowdingLevel;
  components: {
    ownership: number;
    analyst: number;
    positioning: number;
  };
}

/**
 * Calculate crowding score (0-100) for a ticker
 * Uses: institutional ownership, analyst ratings, short interest
 * 
 * Scoring formula:
 *   ownership_score = 100 - (inst_pct * 100)  // Lower inst = less crowded
 *   analyst_score = (rec_mean - 1) * 25       // 1=Strong Buy(crowded), 5=Sell(contrarian)
 *   positioning_score = short_pct * 500       // Higher short = less crowded long
 *   total = (ownership * 0.4) + (analyst * 0.35) + (positioning * 0.25)
 * 
 * Level thresholds:
 *   0-20: "extreme" (extremely crowded)
 *   20-35: "crowded"
 *   35-55: "forming"
 *   55-75: "early"
 *   75-100: "contrarian"
 */
export async function getCrowdingScore(ticker: string): Promise<CrowdingScore> {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["defaultKeyStatistics", "financialData", "summaryDetail"],
    });

    // Get raw values
    const instPct = quote.defaultKeyStatistics?.heldPercentInstitutions ?? 0.5; // Default 50%
    const recMean = quote.financialData?.recommendationMean ?? 2.5; // Default neutral (2.5)
    const shortPct = quote.defaultKeyStatistics?.shortPercentOfFloat ?? 0.05; // Default 5%

    // Calculate component scores (all 0-100 scale)
    // Lower institutional ownership = less crowded = higher score
    const ownershipScore = Math.max(0, Math.min(100, 100 - (instPct * 100)));
    
    // Analyst: 1=Strong Buy (crowded), 5=Strong Sell (contrarian)
    // Convert 1-5 to 0-100 where 1→0 and 5→100
    const analystScore = Math.max(0, Math.min(100, (recMean - 1) * 25));
    
    // Higher short interest = more contrarian = higher score
    // Cap at 20% short interest (100 score)
    const positioningScore = Math.max(0, Math.min(100, shortPct * 500));

    // Weighted total
    const totalScore = (ownershipScore * 0.4) + (analystScore * 0.35) + (positioningScore * 0.25);

    // Determine level
    const level = getLevel(totalScore);

    return {
      score: Math.round(totalScore),
      level,
      components: {
        ownership: Math.round(ownershipScore),
        analyst: Math.round(analystScore),
        positioning: Math.round(positioningScore),
      },
    };
  } catch (error) {
    logger.error("crowding", `Failed to get crowding for ${ticker}`, { error });
    // Return neutral score on error
    return {
      score: 50,
      level: "forming",
      components: {
        ownership: 50,
        analyst: 50,
        positioning: 50,
      },
    };
  }
}

/**
 * Get crowding scores for multiple tickers in parallel
 */
export async function getCrowdingScores(tickers: string[]): Promise<Map<string, CrowdingScore>> {
  const results = new Map<string, CrowdingScore>();
  
  const scores = await Promise.all(
    tickers.map(async (ticker) => {
      const score = await getCrowdingScore(ticker);
      return { ticker, score };
    })
  );

  for (const { ticker, score } of scores) {
    results.set(ticker, score);
  }

  return results;
}

/**
 * Calculate aggregate crowding score from multiple scores
 */
export function aggregateCrowdingScores(scores: CrowdingScore[]): CrowdingScore {
  if (scores.length === 0) {
    return {
      score: 50,
      level: "forming",
      components: { ownership: 50, analyst: 50, positioning: 50 },
    };
  }

  const avgOwnership = scores.reduce((sum, s) => sum + s.components.ownership, 0) / scores.length;
  const avgAnalyst = scores.reduce((sum, s) => sum + s.components.analyst, 0) / scores.length;
  const avgPositioning = scores.reduce((sum, s) => sum + s.components.positioning, 0) / scores.length;
  
  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

  return {
    score: Math.round(avgScore),
    level: getLevel(avgScore),
    components: {
      ownership: Math.round(avgOwnership),
      analyst: Math.round(avgAnalyst),
      positioning: Math.round(avgPositioning),
    },
  };
}
