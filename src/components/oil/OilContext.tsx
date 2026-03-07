import { AlertTriangle, Globe, Truck, Calendar } from "lucide-react";
import { OilContextData } from "./types";

interface OilContextProps {
  context: OilContextData;
}

export function OilContext({ context }: OilContextProps) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Globe className="w-4 h-4 text-gray-500" />
        Market Context
      </h3>

      <div className="space-y-4">
        {/* Geopolitical Factors */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Geopolitical Factors
          </h4>
          <ul className="space-y-1">
            {context.geopolitical.map((factor, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                {factor}
              </li>
            ))}
          </ul>
        </div>

        {/* Supply Factors */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Truck className="w-3 h-3" />
            Supply & Demand
          </h4>
          <ul className="space-y-1">
            {context.supply.map((factor, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                {factor}
              </li>
            ))}
          </ul>
        </div>

        {/* Seasonal Context */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Seasonal Pattern
          </h4>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
            {context.seasonal}
          </p>
        </div>
      </div>

      {/* Oil Playbook */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Trading Framework
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-emerald-50 rounded-lg p-3">
            <div className="font-semibold text-emerald-800 mb-1">Bullish Signals</div>
            <ul className="text-emerald-700 space-y-0.5">
              <li>• Middle East escalation</li>
              <li>• OPEC+ production cuts</li>
              <li>• China demand recovery</li>
              <li>• Hurricane season disruptions</li>
            </ul>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="font-semibold text-red-800 mb-1">Bearish Signals</div>
            <ul className="text-red-700 space-y-0.5">
              <li>• Global recession fears</li>
              <li>• US shale production surge</li>
              <li>• OPEC+ cheating on quotas</li>
              <li>• Strong dollar (DXY &gt;105)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
