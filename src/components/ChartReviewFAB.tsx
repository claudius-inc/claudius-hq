"use client";

import { useState } from "react";
import { X, BookOpen } from "lucide-react";

const QUESTIONS = [
  {
    section: "Before You Look at Anything on the Chart",
    items: [
      {
        question: "Do I already have a conclusion about this stock?",
        insight:
          "If you're opening the chart to confirm something you already believe — a thesis, a tip, an analyst's call — then you're not looking at the chart. You're looking for evidence.",
      },
      {
        question: "What am I hoping to see?",
        insight:
          "If you notice that you want the chart to look bullish, you've already identified a bias that will color everything — you'll see support where a neutral eye sees a broken trend.",
      },
    ],
  },
  {
    section: "As You Read the Price Action",
    items: [
      {
        question: "Am I seeing what's here, or am I seeing a story?",
        insight:
          'A chart is just a sequence of prices over time. There\'s a big difference between "the stock has traded in a $14–$16 range for three months" (fact) and "it\'s coiling for a move higher" (story).',
      },
      {
        question: "Whose voice am I hearing right now?",
        insight:
          "When you think \"this looks like a cup-and-handle\" — is that your direct observation, or are you replaying something you read? You might be looking at the chart but seeing through someone else's eyes.",
      },
      {
        question: "What is the stock actually doing, stripped of my position?",
        insight:
          "If you own it, you're not a neutral observer. A 20% drawdown looks completely different to someone who bought at the top versus someone with no position.",
      },
    ],
  },
  {
    section: "When You Feel a Pull to Act",
    items: [
      {
        question:
          "Is this decision coming from what I see, or from what I feel about myself?",
        insight:
          "Am I selling because the situation has changed, or because holding a loser makes me feel like a bad investor?",
      },
      {
        question: "Am I trying to fix a feeling right now?",
        insight:
          'Sometimes a trade isn\'t really about the stock — it\'s about the discomfort of uncertainty. If the honest answer is "I\'m trading to relieve an emotion," that\'s the most important information on your screen.',
      },
      {
        question:
          "Can I just look at this for another thirty seconds without deciding anything?",
        insight:
          "Just look. Don't sort. Don't accept or reject. If the urgency to decide is overwhelming, that urgency itself is worth examining. The chart isn't going anywhere.",
      },
    ],
  },
];

export function ChartReviewFAB() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="Chart Review Questions"
      >
        <BookOpen className="w-6 h-6" />
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          {/* Modal Content */}
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-amber-50">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Self-Awareness Questions
                </h2>
                <p className="text-sm text-gray-600">
                  Before opening a price chart
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-amber-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {QUESTIONS.map((section, sectionIdx) => (
                <div key={sectionIdx} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3">
                    {section.section}
                  </h3>
                  <div className="space-y-4">
                    {section.items.map((item, itemIdx) => (
                      <div
                        key={itemIdx}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-100"
                      >
                        <p className="font-medium text-gray-900 mb-2">
                          &ldquo;{item.question}&rdquo;
                        </p>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {item.insight}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Footer Quote */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500 italic text-center">
                  &ldquo;The chart doesn&apos;t lie, but you might — not intentionally,
                  but through the mind&apos;s automatic machinery of judgment.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
