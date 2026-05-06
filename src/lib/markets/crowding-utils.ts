/**
 * Client-safe crowding utilities (no server dependencies)
 */

export type CrowdingLevel = "contrarian" | "early" | "forming" | "crowded" | "extreme";

/**
 * Get a human-readable description of the crowding level
 */
export function getCrowdingDescription(level: CrowdingLevel): string {
  switch (level) {
    case "extreme":
      return "Extremely crowded trade — high risk of reversal";
    case "crowded":
      return "Popular consensus — consider smaller positions";
    case "forming":
      return "Consensus forming — monitor for crowding";
    case "early":
      return "Early stage — room for more participation";
    case "contrarian":
      return "Contrarian opportunity — few positioned";
  }
}

/**
 * Get color class for crowding score
 */
export function getCrowdingColor(score: number): string {
  if (score <= 30) return "text-red-600";
  if (score <= 55) return "text-yellow-600";
  return "text-green-600";
}

/**
 * Get background color class for crowding badge
 */
export function getCrowdingBgColor(score: number): string {
  if (score <= 30) return "bg-red-100 text-red-700";
  if (score <= 55) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

/**
 * Get level from score
 */
export function getLevel(score: number): CrowdingLevel {
  if (score <= 20) return "extreme";
  if (score <= 35) return "crowded";
  if (score <= 55) return "forming";
  if (score <= 75) return "early";
  return "contrarian";
}
