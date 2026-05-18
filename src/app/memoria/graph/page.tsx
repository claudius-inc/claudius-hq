"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Filter,
  Info,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { MemoriaHeader } from "../_components/MemoriaHeader";

// Dynamically import ForceGraph2D to avoid SSR issues with canvas
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 text-gray-500">
      <span className="text-sm">Loading graph renderer...</span>
    </div>
  ),
});

interface GraphNode {
  id: string;
  content: string;
  category: string;
  importance: number;
  entities: string[];
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    generatedAt: string;
    snapshotId?: number;
    snapshotCreatedAt?: string;
  };
}

const NODE_COLORS: Record<string, string> = {
  fact: "#2563eb", // blue-600
  insight: "#16a34a", // green-600
  context: "#d97706", // amber-600
  decision: "#dc2626", // red-600
};

const EDGE_COLORS: Record<string, string> = {
  semantic: "#9333ea", // purple-600
  causal: "#dc2626", // red-600
  temporal: "#2563eb", // blue-600
  entity: "#16a34a", // green-600
};

const CATEGORIES = ["fact", "insight", "context", "decision"];
const EDGE_TYPES = ["semantic", "causal", "temporal", "entity"];

function GraphPageContent() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<string[]>(CATEGORIES);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<string[]>(EDGE_TYPES);
  const [minImportance, setMinImportance] = useState(0);
  const fgRef = useRef<any>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memoria/mnemon/graph");
      const data = await res.json();
      setGraphData(data);
    } catch {
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const filteredNodes =
    graphData?.nodes.filter(
      (n) =>
        activeCategories.includes(n.category) && n.importance >= minImportance
    ) || [];

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  const filteredEdges =
    graphData?.edges.filter(
      (e) =>
        activeEdgeTypes.includes(e.type) &&
        filteredNodeIds.has(e.source) &&
        filteredNodeIds.has(e.target)
    ) || [];

  const handleNodeClick = useCallback(
    (node: any) => {
      const found = graphData?.nodes.find((n) => n.id === node.id) || null;
      setSelectedNode(found);
      setSidebarOpen(true);
    },
    [graphData]
  );

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleEdgeType = (type: string) => {
    setActiveEdgeTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  return (
    <div className="space-y-4">
      <MemoriaHeader
        searchQuery=""
        onSearchChange={() => {}}
        onAddClick={() => {}}
        onRandomClick={() => {}}
        total={graphData?.meta.nodeCount ?? 0}
      />

      {/* Stats bar */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <Info size={14} className="text-gray-400" />
            {filteredNodes.length} / {graphData?.meta.nodeCount ?? 0} nodes
          </span>
          <span className="flex items-center gap-1.5">
            <Info size={14} className="text-gray-400" />
            {filteredEdges.length} / {graphData?.meta.edgeCount ?? 0} edges
          </span>
          {graphData?.meta.generatedAt && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              Generated{" "}
              {new Date(graphData.meta.generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              filtersOpen
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <Filter size={12} />
            Filters
            {filtersOpen ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          >
            {sidebarOpen ? (
              <>
                <PanelLeftClose size={12} /> Hide
              </>
            ) : (
              <>
                <PanelLeftOpen size={12} /> Details
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          {/* Category filters */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">
              Categories
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    activeCategories.includes(cat)
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: NODE_COLORS[cat] }}
                  />
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Edge type filters */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">
              Edge Types
            </p>
            <div className="flex flex-wrap gap-2">
              {EDGE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleEdgeType(type)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    activeEdgeTypes.includes(type)
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: EDGE_COLORS[type] }}
                  />
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Importance slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-gray-700">
                Min Importance
              </p>
              <span className="text-xs text-gray-500">{minImportance}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={minImportance}
              onChange={(e) => setMinImportance(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
        </div>
      )}

      {/* Graph + Sidebar layout */}
      <div className="flex gap-4">
        {/* Graph canvas */}
        <div
          className={`flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden ${
            sidebarOpen ? "hidden lg:block" : "block"
          }`}
          style={{ height: "60vh" }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-96 text-gray-500">
              <span className="text-sm">Loading graph...</span>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-gray-500">
              <span className="text-sm">
                No nodes match the current filters.
              </span>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-96 text-gray-500">
                  <span className="text-sm">Loading graph renderer...</span>
                </div>
              }
            >
              <ForceGraph2D
                ref={fgRef}
                graphData={{
                  nodes: filteredNodes.map((n) => ({ ...n })),
                  links: filteredEdges.map((e) => ({ ...e })),
                }}
                nodeColor={(n: any) => NODE_COLORS[n.category] || "#6b7280"}
                nodeRelSize={6}
                nodeLabel={(n: any) =>
                  `[${n.category}] ${n.content.slice(0, 80)}${
                    n.content.length > 80 ? "..." : ""
                  }`
                }
                linkColor={(l: any) =>
                  EDGE_COLORS[l.type] || "#9ca3af"
                }
                linkWidth={(l: any) => Math.max(1, (l.weight || 1) * 1.5)}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                onNodeClick={handleNodeClick}
                backgroundColor="#ffffff"
                width={undefined}
                height={undefined}
                warmupTicks={30}
                cooldownTicks={50}
              />
            </Suspense>
          )}
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-full lg:w-80 xl:w-96 shrink-0 bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col max-h-[70vh] lg:max-h-none">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Node Details
              </h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedNode ? (
                <>
                  <div>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full text-white"
                      style={{
                        backgroundColor:
                          NODE_COLORS[selectedNode.category] || "#6b7280",
                      }}
                    >
                      {selectedNode.category}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      Importance: {selectedNode.importance}/10
                    </span>
                  </div>

                  <p className="text-sm text-gray-800 leading-relaxed">
                    {selectedNode.content}
                  </p>

                  {selectedNode.entities.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">
                        Entities
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.entities.map((e) => (
                          <span
                            key={e}
                            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedNode.tags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">
                        Tags
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8">
                  Click a node in the graph to see details.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
          <div className="h-96 bg-gray-100 rounded animate-pulse" />
        </div>
      }
    >
      <GraphPageContent />
    </Suspense>
  );
}
