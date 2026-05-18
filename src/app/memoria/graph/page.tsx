"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Filter,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  RotateCcw,
  LayoutGrid,
  Network,
  ArrowLeft,
  Maximize2,
  BookPlus,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { MemoriaHeader } from "../_components/MemoriaHeader";
import { GraphQAPanel } from "../_components/GraphQAPanel";

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

interface ClusterNode {
  id: string;
  label: string;
  nodeIds: string[];
  nodes: GraphNode[];
  size: number;
  category: string;
  color: string;
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

const DEFAULT_CATEGORIES = ["insight", "decision", "context"];
const DEFAULT_MIN_IMPORTANCE = 3;
const MAX_RENDERED_NODES = 100;

function useLocalStorage<T>(key: string, initialValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const item = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStored((prev) => {
      const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [key]);
  return [stored, setValue];
}

function buildClusters(nodes: GraphNode[]): ClusterNode[] {
  // Group nodes by their first entity (or "uncategorized" if none)
  const groups = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = node.entities.length > 0 ? node.entities[0] : "Uncategorized";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(node);
  }

  return Array.from(groups.entries()).map(([label, groupNodes]) => {
    // Pick dominant category by count
    const catCounts = new Map<string, number>();
    for (const n of groupNodes) {
      catCounts.set(n.category, (catCounts.get(n.category) || 0) + 1);
    }
    let dominantCat = groupNodes[0]?.category || "fact";
    let maxCount = 0;
    Array.from(catCounts.entries()).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantCat = cat;
      }
    });

    return {
      id: `cluster-${label}`,
      label,
      nodeIds: groupNodes.map((n) => n.id),
      nodes: groupNodes,
      size: groupNodes.length,
      category: dominantCat,
      color: NODE_COLORS[dominantCat] || "#6b7280",
    };
  });
}

function GraphPageContent() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ClusterNode | null>(null);
  const [generatingWiki, setGeneratingWiki] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);

  const generateWikiFromCluster = useCallback(async (cluster: ClusterNode) => {
    setGeneratingWiki(true);
    setWikiError(null);
    try {
      const res = await fetch("/api/memoria/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightIds: cluster.nodeIds,
          title: cluster.label,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWikiError(data.error || "Failed to generate wiki article");
        return;
      }
      window.location.href = `/memoria/wiki/${data.page.slug}`;
    } catch (e: any) {
      setWikiError(String(e?.message || e));
    } finally {
      setGeneratingWiki(false);
    }
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useLocalStorage("memoria-graph-filters-open", false);
  const [activeCategories, setActiveCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<string[]>(EDGE_TYPES);
  const [minImportance, setMinImportance] = useState(DEFAULT_MIN_IMPORTANCE);
  const [viewMode, setViewMode] = useState<"cluster" | "node">("cluster");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Set<string> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasInitialized, setHasInitialized] = useLocalStorage("memoria-graph-initialized", false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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

  // Apply smart defaults only on first visit
  useEffect(() => {
    if (!hasInitialized && graphData && graphData.meta.nodeCount > 100) {
      setActiveCategories(DEFAULT_CATEGORIES);
      setMinImportance(DEFAULT_MIN_IMPORTANCE);
      setViewMode("cluster");
      setHasInitialized(true);
    }
  }, [hasInitialized, graphData, setHasInitialized]);

  // Search handler
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/memoria/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const resultIds = new Set<string>(data.entries?.map((e: any) => String(e.id)) || []);
      setSearchResults(resultIds);
      // Switch to node view when searching
      setViewMode("node");
    } catch {
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onSearchChange = useCallback((q: string) => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => handleSearch(q), 400);
  }, [handleSearch]);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    if (!graphData) return [];
    let nodes = graphData.nodes.filter(
      (n) =>
        activeCategories.includes(n.category) && n.importance >= minImportance
    );

    // If search is active, show search results + 1-hop neighbors
    if (searchResults && searchResults.size > 0) {
      const neighborIds = new Set<string>(searchResults);
      for (const edge of graphData.edges) {
        if (searchResults.has(edge.source)) neighborIds.add(edge.target);
        if (searchResults.has(edge.target)) neighborIds.add(edge.source);
      }
      nodes = nodes.filter((n) => neighborIds.has(n.id));
    }

    // Cap to MAX_RENDERED_NODES by importance
    if (nodes.length > MAX_RENDERED_NODES) {
      nodes = nodes
        .sort((a, b) => b.importance - a.importance)
        .slice(0, MAX_RENDERED_NODES);
    }

    return nodes;
  }, [graphData, activeCategories, minImportance, searchResults]);

  const isCapped = useMemo(() => {
    if (!graphData) return false;
    let nodes = graphData.nodes.filter(
      (n) => activeCategories.includes(n.category) && n.importance >= minImportance
    );
    if (searchResults && searchResults.size > 0) {
      const neighborIds = new Set<string>(searchResults);
      for (const edge of graphData.edges) {
        if (searchResults.has(edge.source)) neighborIds.add(edge.target);
        if (searchResults.has(edge.target)) neighborIds.add(edge.source);
      }
      nodes = nodes.filter((n) => neighborIds.has(n.id));
    }
    return nodes.length > MAX_RENDERED_NODES;
  }, [graphData, activeCategories, minImportance, searchResults]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  const filteredEdges = useMemo(() => {
    if (!graphData) return [];
    return graphData.edges.filter(
      (e) =>
        activeEdgeTypes.includes(e.type) &&
        filteredNodeIds.has(e.source) &&
        filteredNodeIds.has(e.target)
    );
  }, [graphData, activeEdgeTypes, filteredNodeIds]);

  // Build clusters from filtered nodes
  const clusters = useMemo(() => buildClusters(filteredNodes), [filteredNodes]);

  const handleNodeClick = useCallback(
    (node: any) => {
      const found = graphData?.nodes.find((n) => n.id === node.id) || null;
      setSelectedNode(found);
      setSelectedCluster(null);
      setSidebarOpen(true);
    },
    [graphData]
  );

  const handleClusterClick = useCallback(
    (cluster: any) => {
      const found = clusters.find((c) => c.id === cluster.id) || null;
      setSelectedCluster(found);
      setSelectedNode(null);
      setSidebarOpen(true);
    },
    [clusters]
  );

  const expandCluster = useCallback((cluster: ClusterNode) => {
    setViewMode("node");
    // Optionally filter to just this cluster's nodes? Let's keep all filtered nodes visible
  }, []);

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

  const resetFilters = () => {
    setActiveCategories(DEFAULT_CATEGORIES);
    setActiveEdgeTypes(EDGE_TYPES);
    setMinImportance(DEFAULT_MIN_IMPORTANCE);
    setSearchQuery("");
    setSearchResults(null);
    setViewMode("cluster");
  };

  const showAll = () => {
    setActiveCategories(CATEGORIES);
    setMinImportance(0);
  };

  // Graph data for rendering
  const renderGraphData = useMemo(() => {
    if (viewMode === "cluster") {
      const clusterNodes = clusters.map((c) => ({
        id: c.id,
        label: c.label,
        size: c.size,
        category: c.category,
        color: c.color,
        _cluster: true,
      }));

      // Build inter-cluster edges: count edges between clusters
      const interClusterEdges: Record<string, { source: string; target: string; weight: number; type: string }> = {};
      for (const edge of filteredEdges) {
        const sourceCluster = clusters.find((c) => c.nodeIds.includes(edge.source));
        const targetCluster = clusters.find((c) => c.nodeIds.includes(edge.target));
        if (sourceCluster && targetCluster && sourceCluster.id !== targetCluster.id) {
          const key = [sourceCluster.id, targetCluster.id].sort().join("--");
          if (!interClusterEdges[key]) {
            interClusterEdges[key] = {
              source: sourceCluster.id,
              target: targetCluster.id,
              weight: 0,
              type: edge.type,
            };
          }
          interClusterEdges[key].weight += edge.weight;
        }
      }

      return {
        nodes: clusterNodes,
        links: Object.values(interClusterEdges),
      };
    }

    return {
      nodes: filteredNodes.map((n) => ({ ...n })),
      links: filteredEdges.map((e) => ({ ...e })),
    };
  }, [viewMode, clusters, filteredNodes, filteredEdges]);

  const totalNodes = graphData?.meta.nodeCount ?? 0;
  const totalEdges = graphData?.meta.edgeCount ?? 0;

  return (
    <div className="space-y-4">
      <MemoriaHeader
        searchQuery=""
        onSearchChange={() => {}}
        searchMode="text"
        onSearchModeChange={() => {}}
        onAddClick={() => {}}
        onRandomClick={() => {}}
        total={totalNodes}
      />

      {/* Graph Q&A Panel */}
      <GraphQAPanel
        allNodes={graphData?.nodes || []}
        onCitationClick={(nodeId) => {
          const node = graphData?.nodes.find((n) => n.id === nodeId) || null;
          if (node) {
            setSelectedNode(node);
            setSelectedCluster(null);
            setSidebarOpen(true);
          }
        }}
      />

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search memoria and visualize results..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            onSearchChange(e.target.value);
          }}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setSearchResults(null);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
        {isSearching && (
          <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching...</span>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <Info size={14} className="text-gray-400" />
            {viewMode === "cluster" ? `${clusters.length} clusters` : `${filteredNodes.length} nodes`}
            {" "}
            <span className="text-gray-400">
              / {totalNodes} total
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Info size={14} className="text-gray-400" />
            {viewMode === "cluster"
              ? `${renderGraphData.links.length} cluster links`
              : `${filteredEdges.length} edges`}
            {" "}
            <span className="text-gray-400">
              / {totalEdges} total
            </span>
          </span>
          {isCapped && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
              Showing top {MAX_RENDERED_NODES} of {totalNodes} nodes — adjust filters to see more
            </span>
          )}
          {graphData?.meta.generatedAt && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              Generated{" "}
              {new Date(graphData.meta.generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("cluster")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === "cluster"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              title="Cluster view"
            >
              <LayoutGrid size={12} />
              Clusters
            </button>
            <button
              onClick={() => setViewMode("node")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === "node"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              title="Node view"
            >
              <Network size={12} />
              Nodes
            </button>
          </div>
          <button
            onClick={() => setFiltersOpen((prev) => !prev)}
            className={`hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
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
            onClick={() => setMobileFiltersOpen(true)}
            className="sm:hidden flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          >
            <Filter size={12} />
            Filters
          </button>
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            title="Reset to smart defaults"
          >
            <RotateCcw size={12} />
            Reset
          </button>
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="hidden lg:flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
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

      {/* Desktop Filters panel */}
      {filtersOpen && (
        <div className="hidden sm:block bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">Filters</p>
            <div className="flex items-center gap-2">
              <button
                onClick={showAll}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Show all
              </button>
              <button
                onClick={() => setFiltersOpen(false)}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
              >
                <X size={12} />
              </button>
            </div>
          </div>

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

      {/* Mobile filters drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl p-4 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Filters</p>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

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

            <div className="flex gap-2 pt-2">
              <button
                onClick={showAll}
                className="flex-1 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg"
              >
                Show all
              </button>
              <button
                onClick={resetFilters}
                className="flex-1 py-2 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg"
              >
                Reset defaults
              </button>
            </div>
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
          ) : renderGraphData.nodes.length === 0 ? (
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
                graphData={renderGraphData}
                nodeColor={(n: any) => n.color || NODE_COLORS[n.category] || "#6b7280"}
                nodeRelSize={viewMode === "cluster" ? 8 : 6}
                nodeLabel={(n: any) =>
                  viewMode === "cluster"
                    ? `${n.label} (${n.size} nodes)`
                    : `[${n.category}] ${n.content.slice(0, 80)}${
                        n.content.length > 80 ? "..." : ""
                      }`
                }
                linkColor={(l: any) => EDGE_COLORS[l.type] || "#9ca3af"}
                linkWidth={(l: any) => Math.max(1, (l.weight || 1) * 1.5)}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                onNodeClick={viewMode === "cluster" ? handleClusterClick : handleNodeClick}
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
                {selectedCluster ? "Cluster Details" : "Node Details"}
              </h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedCluster ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full text-white"
                      style={{ backgroundColor: selectedCluster.color }}
                    >
                      {selectedCluster.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {selectedCluster.size} nodes
                    </span>
                  </div>

                  <h4 className="text-sm font-medium text-gray-900">
                    {selectedCluster.label}
                  </h4>

                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => expandCluster(selectedCluster)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Maximize2 size={12} />
                      Expand cluster in node view
                    </button>
                    <button
                      onClick={() => generateWikiFromCluster(selectedCluster)}
                      disabled={generatingWiki || selectedCluster.size < 2}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {generatingWiki ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <BookPlus size={12} />
                      )}
                      {generatingWiki
                        ? "Synthesizing…"
                        : `Generate wiki article (${selectedCluster.size} insights)`}
                    </button>
                    {wikiError && (
                      <div className="text-[11px] text-red-600">{wikiError}</div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1.5">
                      Nodes in this cluster
                    </p>
                    <div className="space-y-2">
                      {selectedCluster.nodes.map((node) => (
                        <div
                          key={node.id}
                          onClick={() => {
                            setSelectedNode(node);
                            setSelectedCluster(null);
                          }}
                          className="p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  NODE_COLORS[node.category] || "#6b7280",
                              }}
                            />
                            <span className="text-xs font-medium text-gray-700">
                              {node.category}
                            </span>
                            <span className="text-xs text-gray-400">
                              importance: {node.importance}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {node.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : selectedNode ? (
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
                  Click a {viewMode === "cluster" ? "cluster" : "node"} in the graph to see details.
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
