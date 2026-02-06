"use client";

interface PhaseStepperProps {
  currentPhase: string;
}

const phases = [
  { key: "build", label: "Build", emoji: "🔨" },
  { key: "launch", label: "Launch", emoji: "🚀" },
  { key: "grow", label: "Grow", emoji: "📈" },
  { key: "iterate", label: "Iterate", emoji: "🔄" },
  { key: "maintain", label: "Maintain", emoji: "🛡️" },
];

export function PhaseStepper({ currentPhase }: PhaseStepperProps) {
  const currentIndex = phases.findIndex((p) => p.key === currentPhase);
  
  return (
    <div className="w-full">
      {/* Desktop stepper */}
      <div className="hidden sm:flex items-center justify-between">
        {phases.map((phase, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;
          
          return (
            <div key={phase.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    isCompleted
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                      ? "bg-emerald-500 text-white ring-4 ring-emerald-100"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span>{phase.emoji}</span>
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    isCurrent ? "text-emerald-600" : isCompleted ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  {phase.label}
                </span>
              </div>
              
              {/* Connector line */}
              {index < phases.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded ${
                    index < currentIndex ? "bg-emerald-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile stepper - compact */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          {phases.map((phase, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            
            return (
              <div key={phase.key} className="flex items-center flex-1 last:flex-none">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                    isCompleted
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                      ? "bg-emerald-500 text-white ring-2 ring-emerald-100"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isCompleted ? "✓" : phase.emoji}
                </div>
                {index < phases.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 ${
                      index < currentIndex ? "bg-emerald-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="text-center">
          <span className="text-sm font-medium text-emerald-600">
            {phases[currentIndex]?.emoji} {phases[currentIndex]?.label || currentPhase}
          </span>
        </div>
      </div>
    </div>
  );
}
