// This file is auto-generated from backend/openapi.yaml via openapi-ts.
// DO NOT EDIT MANUALLY — run `npm run generate` in sdk/client to regenerate.
// Generator: @hey-api/openapi-ts@0.46

export type Campaign = {
  id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  featured: boolean;
  hidden?: boolean;
  hiddenReason?: string | null;
  rewardPerAction: number;
  startDate?: string | null;
  endDate?: string | null;
  status: 'active' | 'upcoming' | 'ended';
  createdAt: string;
  updatedAt: string;
  imageUrl?: string | null;
  tags?: string[];
  category?: string | null;
};

export type CampaignCreate = {
  name: string;
  slug?: string;
  description?: string;
  rewardPerAction: number;
  active?: boolean;
  featured?: boolean;
  hidden?: boolean;
  hiddenReason?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  imageUrl?: string;
  tags?: string[];
  category?: string;
};

export type CampaignUpdate = {
  name?: string;
  slug?: string;
  description?: string;
  rewardPerAction?: number;
  active?: boolean;
  featured?: boolean;
  hidden?: boolean;
  hiddenReason?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type Pagination = {
  total: number;
  count: number;
  page: number;
  limit: number;
  offset: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  previousPage?: number | null;
  nextPage?: number | null;
};

export type CampaignListResponse = {
  data: Campaign[];
  pagination: Pagination;
};

export type HealthResponse = {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  rpc: RpcHealthResponse;
};

export type RpcHealthResponse = {
  status: 'ok' | 'error';
  latency_ms?: number;
  error?: string;
};

export type ApiInfo = {
  name?: string;
  version?: string;
  prefix?: string;
  endpoints?: Record<string, unknown>;
  compatibility?: Record<string, unknown>;
  stellar?: Record<string, unknown>;
  config?: Record<string, unknown>;
  cors?: Record<string, unknown>;
  rateLimit?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

export type ConfigResponse = {
  stellar: {
    network?: string;
    networkPassphrase?: string;
    sorobanRpcUrl?: string;
    horizonUrl?: string;
    explorerUrl?: string;
  };
  contracts: {
    rewards?: string | null;
    campaign?: string | null;
  };
};

export type ExplorerResponse = {
  network: string;
  explorerUrl: string;
};

export type AuditLog = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  diff?: Record<string, unknown>;
  timestamp: string;
};

export type AuditLogListResponse = {
  data: AuditLog[];
  pagination: Pagination;
};

export type IndexerCursorState = {
  cursor: string | null;
  updatedAt: string;
  source: string;
};

export type IndexerCursorUpdate = {
  cursor: string;
};

export type ApiKeyMetadata = {
  id?: string;
  label?: string;
  createdAt?: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  active?: boolean;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  userEmail: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

export type OrganizationInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  token: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
};

export type ApiError = {
  error: string;
  code: string;
};

export type ValidationError = {
  error: string;
  code: string;
  details: string[];
};
