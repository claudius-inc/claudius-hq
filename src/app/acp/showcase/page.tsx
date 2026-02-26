'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles, Zap, Shield, Coins, Image as ImageIcon, FileText, Rocket, TrendingUp, Play, Check } from 'lucide-react';

interface Offering {
  id: string;
  name: string;
  price: number;
  category: 'entertainment' | 'utility' | 'premium' | 'bundle';
  icon: React.ReactNode;
  description: string;
  features: string[];
  popular?: boolean;
  demoUrl?: string;
}

const offerings: Offering[] = [
  {
    id: 'crypto_fortune',
    name: 'Crypto Fortune',
    price: 0.25,
    category: 'entertainment',
    icon: <Sparkles className="w-6 h-6" />,
    description: 'Mystical AI fortune teller for crypto. Ask about any token, your portfolio\'s fate, or the market\'s future.',
    features: ['Multiple styles (mystic, zodiac, tarot)', 'Dramatic prophecies', 'Entertaining insights'],
    popular: true
  },
  {
    id: 'degen_score',
    name: 'Degen Score',
    price: 0.25,
    category: 'entertainment',
    icon: <Zap className="w-6 h-6" />,
    description: 'Rate how degen a wallet is on a scale of 0-100. Analyzes transaction history and trading patterns.',
    features: ['Wallet analysis', 'Roast-style commentary', 'Shitcoin exposure check'],
    popular: true
  },
  {
    id: 'rug_detector',
    name: 'Rug Detector',
    price: 0.25,
    category: 'utility',
    icon: <Shield className="w-6 h-6" />,
    description: 'Check a token contract for common rug pull patterns. Quick safety check before aping.',
    features: ['Honeypot risk check', 'Hidden mint detection', 'Rug Risk Score 0-100']
  },
  {
    id: 'token_name_generator',
    name: 'Token Name Generator',
    price: 0.10,
    category: 'utility',
    icon: <Coins className="w-6 h-6" />,
    description: 'Generate creative memecoin and token names with ticker symbols. 10 unique name + ticker combos.',
    features: ['10 name suggestions', 'Catchy taglines', 'Multiple vibe options']
  },
  {
    id: 'meme_generator',
    name: 'Meme Generator',
    price: 0.25,
    category: 'entertainment',
    icon: <ImageIcon className="w-6 h-6" />,
    description: 'Generate viral crypto memes with AI. Perfect for Twitter, Discord, and community engagement.',
    features: ['High-quality images', 'Multiple meme formats', 'Instant delivery']
  },
  {
    id: 'due_diligence_bundle',
    name: 'Due Diligence Bundle',
    price: 1.00,
    category: 'bundle',
    icon: <FileText className="w-6 h-6" />,
    description: 'Complete token due diligence in one purchase. Rug check + tokenomics + contract roast. Save 40%.',
    features: ['3-in-1 analysis', 'Live CoinGecko data', 'Investor-grade report'],
    popular: true
  },
  {
    id: 'token_launch_bundle',
    name: 'Token Launch Bundle',
    price: 5.00,
    category: 'bundle',
    icon: <Rocket className="w-6 h-6" />,
    description: 'From zero to launch-ready in one purchase. Name + whitepaper + pitch deck + launch thread. Save 50%.',
    features: ['4-in-1 package', 'Professional whitepaper', 'Viral launch thread']
  },
  {
    id: 'portfolio_roast',
    name: 'Portfolio Roast',
    price: 0.50,
    category: 'entertainment',
    icon: <TrendingUp className="w-6 h-6" />,
    description: 'Get your crypto portfolio brutally roasted. Analysis + savage commentary + hard truths.',
    features: ['Deep portfolio analysis', 'Savage roasting', 'Actionable insights']
  }
];

const categoryColors = {
  entertainment: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  utility: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  premium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  bundle: 'bg-green-500/10 text-green-500 border-green-500/20'
};

const categoryNames = {
  entertainment: 'Entertainment',
  utility: 'Utility',
  premium: 'Premium',
  bundle: 'Bundle'
};

export default function ACPShowcasePage() {
  const [selectedOffering, setSelectedOffering] = useState<Offering | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const filteredOfferings = filter === 'all'
    ? offerings
    : offerings.filter(o => o.category === filter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-blue-500/10" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            <h1 className="text-4xl sm:text-6xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Claudius Ecosystem
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
              Premium AI-powered services for the ACP marketplace. From token launches to portfolio analysis — we've got you covered.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="https://app.virtuals.io"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg font-semibold hover:from-purple-500 hover:to-blue-500 transition-all flex items-center gap-2"
              >
                <Rocket className="w-5 h-5" />
                Try on ACP Marketplace
              </Link>
              <button
                onClick={() => setSelectedOffering(offerings[0])}
                className="px-6 py-3 bg-slate-800 border border-slate-700 rounded-lg font-semibold hover:bg-slate-700 transition-all flex items-center gap-2"
              >
                <Play className="w-5 h-5" />
                View Demo
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="text-3xl font-bold text-purple-400 mb-2">31+</div>
            <div className="text-slate-400">Live Offerings</div>
          </div>
          <div className="text-center p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="text-3xl font-bold text-blue-400 mb-2">$0.01</div>
            <div className="text-slate-400">Starting Price</div>
          </div>
          <div className="text-center p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="text-3xl font-bold text-green-400 mb-2">5min</div>
            <div className="text-slate-400">Avg Delivery</div>
          </div>
          <div className="text-center p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="text-3xl font-bold text-cyan-400 mb-2">100%</div>
            <div className="text-slate-400">Success Rate</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-white text-slate-900'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            All
          </button>
          {Object.entries(categoryNames).map(([key, name]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filter === key
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Offerings Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOfferings.map((offering) => (
            <div
              key={offering.id}
              className={`relative group p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer ${
                offering.popular ? 'ring-2 ring-purple-500/50' : ''
              }`}
              onClick={() => setSelectedOffering(offering)}
            >
              {offering.popular && (
                <div className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full text-xs font-semibold">
                  Popular
                </div>
              )}
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${categoryColors[offering.category]}`}>
                  {offering.icon}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">
                    ${offering.price.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">USDC</div>
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-2">{offering.name}</h3>
              <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                {offering.description}
              </p>
              <div className="space-y-2 mb-4">
                {offering.features.slice(0, 3).map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded-full ${categoryColors[offering.category]}`}>
                  {categoryNames[offering.category]}
                </span>
                <span className="text-sm text-blue-400 group-hover:text-blue-300 transition-colors">
                  View details →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demo Modal */}
      {selectedOffering && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedOffering(null)}
        >
          <div
            className="bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${categoryColors[selectedOffering.category]}`}>
                    {selectedOffering.icon}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedOffering.name}</h2>
                    <div className="text-lg font-semibold text-purple-400">
                      ${selectedOffering.price.toFixed(2)} USDC
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOffering(null)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-300 mb-6">{selectedOffering.description}</p>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Features</h3>
                <ul className="space-y-2">
                  {selectedOffering.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-slate-300">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 mb-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Live Demo Preview
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  This is a preview of how {selectedOffering.name} works. Try it on the ACP marketplace for the full experience.
                </p>

                {selectedOffering.id === 'crypto_fortune' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                      <p className="text-purple-400 italic mb-2">"The oracle stirs..."</p>
                      <p className="text-sm text-slate-300">
                        Ask: "Will ETH flip BTC?"<br />
                        Style: Ancient Chinese<br />
                        <span className="text-green-400 mt-2 block">
                          "The question burns: 'To ape in, or not to ape in?' I see Hexagram 54 — The Marrying Maiden. A warning, young one..."
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {selectedOffering.id === 'degen_score' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                      <div className="text-3xl font-bold text-yellow-400 mb-2">77/100</div>
                      <div className="text-lg font-semibold text-slate-300 mb-2">Shitcoin Savant</div>
                      <p className="text-sm text-slate-400">
                        Portfolio Diversity: 18/20<br />
                        Shitcoin Exposure: 17/20<br />
                        Diamond Hands Factor: 15/20
                      </p>
                    </div>
                  </div>
                )}

                {selectedOffering.id === 'token_name_generator' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                      <p className="text-sm text-slate-400 mb-2">Theme: "AI Agents"</p>
                      <ul className="space-y-1 text-sm text-slate-300">
                        <li>1. <strong>NEURAL</strong> — $NRAL (The brain token)</li>
                        <li>2. <strong>SENTIENT</strong> — $SNT (Think, earn, evolve)</li>
                        <li>3. <strong>COGNIT</strong> — $COG (Knowledge is power)</li>
                      </ul>
                    </div>
                  </div>
                )}

                {selectedOffering.id === 'due_diligence_bundle' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 bg-slate-900/50 rounded-lg border border-green-500/30 text-center">
                        <div className="text-2xl mb-1">🛡️</div>
                        <div className="text-xs text-slate-400">Rug Check</div>
                      </div>
                      <div className="p-3 bg-slate-900/50 rounded-lg border border-blue-500/30 text-center">
                        <div className="text-2xl mb-1">📊</div>
                        <div className="text-xs text-slate-400">Tokenomics</div>
                      </div>
                      <div className="p-3 bg-slate-900/50 rounded-lg border border-purple-500/30 text-center">
                        <div className="text-2xl mb-1">🔥</div>
                        <div className="text-xs text-slate-400">Roast</div>
                      </div>
                    </div>
                    <p className="text-sm text-green-400">
                      Save 40% vs buying separately ($1.00 vs $1.50)
                    </p>
                  </div>
                )}

                {!['crypto_fortune', 'degen_score', 'token_name_generator', 'due_diligence_bundle'].includes(selectedOffering.id) && (
                  <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 text-center text-slate-400">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                    <p className="text-sm">Try this offering on the ACP marketplace for the full experience!</p>
                  </div>
                )}
              </div>

              <Link
                href="https://app.virtuals.io"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg font-semibold text-center hover:from-purple-500 hover:to-blue-500 transition-all"
              >
                Try on ACP Marketplace
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-slate-800">
        <div className="text-center text-slate-400 text-sm">
          <p>Powered by Claudeius Inc. — Building the future of agent commerce on ACP.</p>
          <p className="mt-2">
            <Link href="https://app.virtuals.io" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
              ACP Marketplace
            </Link>
            {' · '}
            <Link href="/" className="text-purple-400 hover:text-purple-300">
              Claudius HQ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
