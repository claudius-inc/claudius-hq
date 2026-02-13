'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Upload, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  currency: string;
  priceCurrency?: string;
  totalCost: number;
  realizedPnl: number;
  currentPrice: number;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  totalPnl: number;
  // USD-converted values
  fxRate?: number;
  marketValueUSD?: number;
  totalCostUSD?: number;
  unrealizedPnlUSD?: number;
  realizedPnlUSD?: number;
}

interface Summary {
  totalCost: number;
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  totalRealizedPnl: number;
  dayPnl: number;
  dayPnlPct: number;
  baseCurrency?: string;
}

interface Trade {
  id: number;
  tradeDate: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  currency: string;
  commission: number;
  total: number;
}

interface Import {
  id: number;
  filename: string;
  statementStart: string | null;
  statementEnd: string | null;
  tradeCount: number;
  dividendCount: number;
  createdAt: string;
}

export default function IBKRPortfolio() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeSection, setActiveSection] = useState<'positions' | 'trades' | 'imports'>('positions');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/ibkr/positions');
      const data = await res.json();
      setPositions(data.positions || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    }
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/ibkr/trades?limit=100');
      const data = await res.json();
      setTrades(data.trades || []);
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    }
  }, []);

  const fetchImports = useCallback(async () => {
    try {
      const res = await fetch('/api/ibkr/imports');
      const data = await res.json();
      setImports(data.imports || []);
    } catch (err) {
      console.error('Failed to fetch imports:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchPositions(), fetchTrades(), fetchImports()]).finally(() => setLoading(false));
  }, [fetchPositions, fetchTrades, fetchImports]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ibkr/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadResult({
          success: true,
          message: `Imported ${data.tradesInserted} trades, ${data.incomeInserted} income records. ${data.positionsUpdated} positions updated.`,
        });
        // Refresh data
        await Promise.all([fetchPositions(), fetchTrades(), fetchImports()]);
      } else {
        setUploadResult({
          success: false,
          message: data.error || 'Upload failed',
        });
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setUploading(false);
      // Clear file input
      e.target.value = '';
    }
  };

  const deleteImport = async (id: number) => {
    if (!confirm('Delete this import and all associated trades?')) return;

    try {
      await fetch('/api/ibkr/imports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await Promise.all([fetchPositions(), fetchTrades(), fetchImports()]);
    } catch (err) {
      console.error('Failed to delete import:', err);
    }
  };

  const formatCurrency = (value: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPct = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'Z').toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">IBKR Import</h3>
          <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 disabled:opacity-50">
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Statement'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
        {uploadResult && (
          <div className={`p-3 rounded-lg text-sm ${uploadResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {uploadResult.message}
          </div>
        )}
        <p className="text-sm text-gray-500 mt-2">
          Upload IBKR Activity Statement (Excel format). Duplicate trades are automatically skipped.
        </p>
      </div>

      {/* Summary Card */}
      {summary && positions.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Portfolio Summary (USD)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-500">Market Value</div>
              <div className="text-xl font-semibold">{formatCurrency(summary.totalMarketValue)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Day P&L</div>
              <div className={`text-xl font-semibold ${summary.dayPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.dayPnl)} ({formatPct(summary.dayPnlPct)})
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Unrealized P&L</div>
              <div className={`text-xl font-semibold ${summary.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.totalUnrealizedPnl)} ({formatPct(summary.totalUnrealizedPnlPct)})
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Realized P&L</div>
              <div className={`text-xl font-semibold ${summary.totalRealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.totalRealizedPnl)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex gap-2 border-b">
        {(['positions', 'trades', 'imports'] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeSection === section
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {section.charAt(0).toUpperCase() + section.slice(1)}
            {section === 'positions' && positions.length > 0 && (
              <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{positions.length}</span>
            )}
            {section === 'trades' && trades.length > 0 && (
              <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{trades.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Positions */}
      {activeSection === 'positions' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          {positions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No positions yet. Upload an IBKR statement to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">Symbol</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Avg Cost</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Day</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Market Value</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">P&L</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {positions.map((pos) => {
                    const displayCurrency = pos.priceCurrency || pos.currency;
                    const isNonUSD = displayCurrency !== 'USD';
                    return (
                    <tr
                      key={pos.symbol}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedSymbol(expandedSymbol === pos.symbol ? null : pos.symbol)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {expandedSymbol === pos.symbol ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <div>
                            <span className="font-medium">{pos.symbol}</span>
                            {isNonUSD && (
                              <span className="ml-2 text-xs text-gray-400">{displayCurrency}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{pos.quantity.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(pos.avgCost, displayCurrency)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(pos.currentPrice, displayCurrency)}</td>
                      <td className={`px-4 py-3 text-right ${pos.dayChangePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {pos.dayChangePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {formatPct(pos.dayChangePct)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div>{formatCurrency(pos.marketValue, displayCurrency)}</div>
                        {isNonUSD && pos.marketValueUSD && (
                          <div className="text-xs text-gray-400">{formatCurrency(pos.marketValueUSD)}</div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${pos.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <div>{formatCurrency(pos.unrealizedPnl, displayCurrency)}</div>
                        {isNonUSD && pos.unrealizedPnlUSD && (
                          <div className={`text-xs ${pos.unrealizedPnlUSD >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(pos.unrealizedPnlUSD)}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right ${pos.unrealizedPnlPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPct(pos.unrealizedPnlPct)}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Trades */}
      {activeSection === 'trades' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          {trades.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No trades yet. Upload an IBKR statement to import trades.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Symbol</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Action</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Commission</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {trades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatDate(trade.tradeDate)}</td>
                      <td className="px-4 py-3 font-medium">{trade.symbol}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          trade.action === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {trade.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{trade.quantity}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(trade.price, trade.currency)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(trade.commission, trade.currency)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(trade.total, trade.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Imports */}
      {activeSection === 'imports' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          {imports.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No imports yet. Upload an IBKR statement to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">File</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Period</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Trades</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Dividends</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Imported</th>
                    <th className="px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {imports.map((imp) => (
                    <tr key={imp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{imp.filename}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {imp.statementStart && imp.statementEnd
                          ? `${formatDate(imp.statementStart)} - ${formatDate(imp.statementEnd)}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">{imp.tradeCount}</td>
                      <td className="px-4 py-3 text-right">{imp.dividendCount}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(imp.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteImport(imp.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete import"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
