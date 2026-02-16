"use client";

import { useState } from "react";
import { marked } from "marked";

interface InvestorCritique {
  name: string;
  philosophy: string;
  critique: string;
  wouldOwn: string[];
  wouldAvoid: string[];
  keyConcern: string;
}

interface InvestorCritiquesProps {
  critiques: InvestorCritique[];
}

const INVESTOR_INFO: Record<string, { philosophy: string; color: string }> = {
  "Warren Buffett": {
    philosophy: "Moats, capital allocation, management integrity",
    color: "border-blue-200 bg-blue-50",
  },
  "Bill Ackman": {
    philosophy: "Activist lens, catalysts, concentrated bets",
    color: "border-orange-200 bg-orange-50",
  },
  "Peter Lynch": {
    philosophy: "GARP, invest in what you know, PEG ratios",
    color: "border-green-200 bg-emerald-50",
  },
  "Ray Dalio": {
    philosophy: "Macro risks, correlation, diversification",
    color: "border-purple-200 bg-purple-50",
  },
  "Neil Shen": {
    philosophy: "China tech/consumer, founder quality, TAM",
    color: "border-red-200 bg-red-50",
  },
  "Zhang Lei": {
    philosophy: "Long-term compounders, research depth, moats",
    color: "border-amber-200 bg-amber-50",
  },
};

function InvestorCard({ critique }: { critique: InvestorCritique }) {
  const [expanded, setExpanded] = useState(false);
  const info = INVESTOR_INFO[critique.name] || {
    philosophy: "",
    color: "border-gray-200 bg-gray-50",
  };

  return (
    <div
      className={`border rounded-xl p-4 ${info.color} cursor-pointer transition-all hover:shadow-md`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">{critique.name}</h4>
          <p className="text-xs text-gray-500">{info.philosophy}</p>
        </div>
        <button className="text-gray-400 hover:text-gray-600">
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          <div 
            className="text-sm text-gray-700 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: marked(critique.critique) as string }}
          />

          <div className="flex gap-4 text-xs">
            {critique.wouldOwn.length > 0 && (
              <div>
                <span className="font-medium text-emerald-700">Would own: </span>
                <span className="text-gray-600">{critique.wouldOwn.join(", ")}</span>
              </div>
            )}
            {critique.wouldAvoid.length > 0 && (
              <div>
                <span className="font-medium text-red-700">Would avoid: </span>
                <span className="text-gray-600">{critique.wouldAvoid.join(", ")}</span>
              </div>
            )}
          </div>

          {critique.keyConcern && (
            <div className="text-xs">
              <span className="font-medium text-amber-700">Key concern: </span>
              <span className="text-gray-600">{critique.keyConcern}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function InvestorCritiques({ critiques }: InvestorCritiquesProps) {
  if (!critiques || critiques.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
        <h3 className="text-sm font-medium text-gray-700 mb-1">
          Investor Critiques
        </h3>
        <p className="text-xs text-gray-500">
          Generate a portfolio analysis to see how legendary investors would view your holdings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Investor Critiques
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {critiques.map((critique) => (
          <InvestorCard key={critique.name} critique={critique} />
        ))}
      </div>
    </div>
  );
}

// Parse investor critiques from markdown report content
export function parseCritiquesFromMarkdown(content: string): InvestorCritique[] {
  const critiques: InvestorCritique[] = [];
  const investorNames = [
    "Warren Buffett",
    "Bill Ackman", 
    "Peter Lynch",
    "Ray Dalio",
    "Neil Shen",
    "Zhang Lei",
  ];

  for (const name of investorNames) {
    // Look for section with investor name
    const regex = new RegExp(
      `###?\\s*${name}['\\u2019]?s?\\s*(?:View|Perspective|Take)?[\\s\\S]*?(?=###|$)`,
      "i"
    );
    const match = content.match(regex);
    
    if (match) {
      const section = match[0];
      
      // Extract quote (text in quotes or after the header)
      const quoteMatch = section.match(/"([^"]+)"/) || section.match(/>\s*([^*\n]+)/);
      const critique = quoteMatch ? quoteMatch[1].trim() : "";
      
      // Extract "Would own" list
      const wouldOwnMatch = section.match(/\*\*Would own[:\*]*\s*([^\n*]+)/i);
      const wouldOwn = wouldOwnMatch 
        ? wouldOwnMatch[1].split(/,\s*/).map(s => s.trim()).filter(Boolean)
        : [];
      
      // Extract "Would avoid" list  
      const wouldAvoidMatch = section.match(/\*\*Would avoid[:\*]*\s*([^\n*]+)/i);
      const wouldAvoid = wouldAvoidMatch
        ? wouldAvoidMatch[1].split(/,\s*/).map(s => s.trim()).filter(Boolean)
        : [];
      
      // Extract key concern
      const concernMatch = section.match(/\*\*Key concern[:\*]*\s*([^\n]+)/i);
      const keyConcern = concernMatch ? concernMatch[1].trim() : "";

      if (critique || wouldOwn.length || wouldAvoid.length) {
        critiques.push({
          name,
          philosophy: INVESTOR_INFO[name]?.philosophy || "",
          critique,
          wouldOwn,
          wouldAvoid,
          keyConcern,
        });
      }
    }
  }

  return critiques;
}
