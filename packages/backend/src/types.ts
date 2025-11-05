export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };

export type BackendEvents = {
  "findings-sent": { count: number; totalCount: number };
};

export type NotifyConfig = {
  defaultIds?: string;
  defaultIdsType?: "id" | "provider";
  customFindingIds?: Record<string, string>;
  customFindingIdsType?: Record<string, "id" | "provider">;
  excludedFindings?: string[];
  sentFindings?: string[];
};

export type SentFinding = {
  findingId: string;
  timestamp: number;
};

export type FindingWithTimestamp = {
  getId: () => string;
  getTitle: () => string;
  getDescription: () => string;
  getReporter: () => string;
  getTimestamp: () => number;
};

