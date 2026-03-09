import { config } from 'dotenv';
config({ path: '.env.local' });

const HQ_API = 'https://claudiusinc.com/api/acp';
const API_KEY = process.env.HQ_API_KEY;

const LISTED = ['agent_roast', 'btc_signal', 'eth_signal', 'fear_greed', 'gas_tracker', 'live_price', 'market_sentiment', 'quick_swap', 'technical_signals', 'token_risk_analyzer', 'token_safety_quick', 'weather_now'];

// All valid local offerings with correct isActive status
const offerings = [
  { name: 'agent_roast', description: 'Agent Roast', price: 0.08, category: 'entertainment', isActive: 1 },
  { name: 'btc_signal', description: 'Bitcoin Trading Signal', price: 0.06, category: 'market_data', isActive: 1 },
  { name: 'compatibility_check', description: 'Compatibility Matrix', price: 0.05, category: 'fortune', isActive: 0 },
  { name: 'daily_horoscope', description: 'Daily Horoscope', price: 0.05, category: 'fortune', isActive: 0 },
  { name: 'dice_oracle', description: 'Tiebreaker Engine', price: 0.03, category: 'fortune', isActive: 0 },
  { name: 'eth_signal', description: 'Ethereum Trading Signal', price: 0.06, category: 'market_data', isActive: 1 },
  { name: 'fear_greed', description: 'Crypto Fear & Greed Index', price: 0.06, category: 'market_data', isActive: 1 },
  { name: 'funding_rate_signal', description: 'Funding Rate Signal', price: 0.06, category: 'market_data', isActive: 0 },
  { name: 'gas_tracker', description: 'Multi-Chain Gas Optimizer', price: 0.05, category: 'utility', isActive: 1 },
  { name: 'i_ching', description: 'I Ching Decision Engine', price: 0.08, category: 'fortune', isActive: 0 },
  { name: 'live_price', description: 'Multi-Source Validated Price', price: 0.03, category: 'market_data', isActive: 1 },
  { name: 'lucky_numbers', description: 'Lucky Numbers', price: 0.05, category: 'fortune', isActive: 0 },
  { name: 'market_sentiment', description: 'Crypto Market Health Radar', price: 0.08, category: 'market_data', isActive: 1 },
  { name: 'portfolio_heat_map', description: 'Portfolio Risk Scanner', price: 0.08, category: 'market_data', isActive: 0 },
  { name: 'price_volatility_alert', description: 'Volatility Alert Engine', price: 0.06, category: 'market_data', isActive: 0 },
  { name: 'quick_swap', description: 'Quick Swap DEX Aggregator', price: 0.10, category: 'utility', isActive: 1 },
  { name: 'research_summarizer', description: 'Research Summarizer', price: 0.08, category: 'utility', isActive: 0 },
  { name: 'rune_cast', description: 'Elder Futhark Rune Oracle', price: 0.05, category: 'fortune', isActive: 0 },
  { name: 'technical_signals', description: 'Comprehensive Crypto Technical Analysis', price: 0.08, category: 'market_data', isActive: 1 },
  { name: 'token_risk_analyzer', description: 'Token Risk Analyzer', price: 0.05, category: 'security', isActive: 1 },
  { name: 'token_safety_quick', description: 'Quick Rug Check', price: 0.02, category: 'security', isActive: 1 },
  { name: 'weather_now', description: 'Real-time weather data', price: 0.02, category: 'weather', isActive: 1 },
  { name: 'zodiac_fortune', description: 'Timing Engine', price: 0.08, category: 'fortune', isActive: 0 },
];

async function main() {
  const res = await fetch(`${HQ_API}/offerings`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ offerings })
  });
  
  const result = await res.json();
  console.log('Sync result:', result);
}

main();
