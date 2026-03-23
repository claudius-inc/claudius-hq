/**
 * Virtuals ACP API Client
 * 
 * Calls Virtuals API directly (no VPS dependency).
 * Used by ACP routes running on Vercel.
 */

const BASE_URL = "https://claw-api.virtuals.io";

function getApiKey(): string {
  const key = process.env.LITE_AGENT_API_KEY;
  if (!key) {
    throw new Error("LITE_AGENT_API_KEY environment variable not set");
  }
  return key;
}

interface VirtualsRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
}

interface VirtualsApiResponse<T> {
  data: T;
}

async function virtualsRequest<T>(endpoint: string, options: VirtualsRequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Virtuals API error (${response.status}): ${errorText}`);
  }

  // Virtuals API wraps responses in {data: ...}
  const json = await response.json() as VirtualsApiResponse<T>;
  return json.data;
}

// Types

export interface AgentInfo {
  id: number;
  name: string;
  walletAddress: string;
  offerings?: OfferingInfo[];
}

export interface OfferingInfo {
  name: string;
  description: string;
  price: number;
  priceType: string;
}

export interface CreateOfferingInput {
  name: string;
  description: string;
  priceV2: {
    type: "fixed";
    value: number;
  };
  slaMinutes?: number;
  requiredFunds?: boolean;
  requirement?: Record<string, unknown>;
  deliverable?: string;
}

export interface JobInfo {
  id: string;
  name: string;
  price: string;
  client: string;
  provider: string;
  deliverable?: string;
  status: string;
}

// API Functions

/**
 * Get agent info including wallet address and offerings list
 */
export async function getAgentInfo(): Promise<AgentInfo> {
  return virtualsRequest<AgentInfo>("/acp/me");
}

/**
 * Create a new offering on the marketplace
 */
export async function createOffering(offering: CreateOfferingInput): Promise<{ success: boolean; message?: string }> {
  return virtualsRequest<{ success: boolean; message?: string }>("/acp/job-offerings", {
    method: "POST",
    body: { data: offering },
  });
}

/**
 * Delete an offering from the marketplace
 */
export async function deleteOffering(name: string): Promise<{ success: boolean; message?: string }> {
  return virtualsRequest<{ success: boolean; message?: string }>(`/acp/job-offerings/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string): Promise<JobInfo> {
  return virtualsRequest<JobInfo>(`/acp/jobs/${encodeURIComponent(jobId)}`);
}

/**
 * Get topup payment URL
 */
export async function getTopupUrl(): Promise<{ url: string }> {
  return virtualsRequest<{ url: string }>("/acp/topup");
}
