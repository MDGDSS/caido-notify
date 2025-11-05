import type { DefineAPI, DefineEvents, SDK } from "caido:plugin";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";

export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };

export type BackendEvents = DefineEvents<{
  "findings-sent": { count: number; totalCount: number };
}>;

type NotifyConfig = {
  defaultIds?: string;
  defaultIdsType?: "id" | "provider";
  customFindingIds?: Record<string, string>;
  customFindingIdsType?: Record<string, "id" | "provider">;
  excludedFindings?: string[];
  sentFindings?: string[];
};

const getConfigDir = (): string => {
  const home = homedir();
  if (!home) {
    let fallback = ".";
    if (typeof process !== "undefined" && process.env) {
      fallback = process.env.HOME || process.env.USERPROFILE || process.env.APPDATA || ".";
    }
    return join(fallback, ".config", "notify-caido");
  }
  return join(home, ".config", "notify-caido");
};

const getNotifyIdsFile = (): string => {
  return join(getConfigDir(), "notify-ids.json");
};

const getProviderConfigFile = (): string => {
  return join(getConfigDir(), "provider-config.yaml");
};

const getDefaultNotifyProviderConfigFile = (): string => {
  const home = homedir();
  if (!home) {
    let fallback = ".";
    if (typeof process !== "undefined" && process.env) {
      fallback = process.env.HOME || process.env.USERPROFILE || process.env.APPDATA || ".";
    }
    return join(fallback, ".config", "notify", "provider-config.yaml");
  }
  return join(home, ".config", "notify", "provider-config.yaml");
};

const getExcludedFindingsFile = (): string => {
  return join(getConfigDir(), "excluded-findings.json");
};

const getSentFindingsFile = (): string => {
  return join(getConfigDir(), "sent-findings.json");
};

const ensureConfigDir = async (): Promise<Result<void>> => {
  try {
    const configDir = getConfigDir();
    await fs.mkdir(configDir, { recursive: true });
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to create config directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const getNotifyCommand = (): string => {
  return "notify";
};

const checkNotifyInstalled = async (sdk: SDK): Promise<Result<boolean>> => {
  return new Promise((resolve) => {
    const notifyCmd = getNotifyCommand();
    const proc = spawn(notifyCmd, ["-version"], {
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | undefined) => {
      if (code === 0 || stdout.length > 0 || stderr.includes("notify")) {
        resolve({ kind: "Ok", value: true });
      } else {
        resolve({ kind: "Ok", value: false });
      }
    });

    proc.on("error", () => {
      resolve({ kind: "Ok", value: false });
    });
  });
};

const saveNotifyIds = async (sdk: SDK, config: NotifyConfig): Promise<Result<void>> => {
  try {
    if (sdk.storage) {
      await sdk.storage.set("notify-ids", JSON.stringify(config));
      return { kind: "Ok", value: undefined };
    }
    const dirResult = await ensureConfigDir();
    if (dirResult.kind === "Error") {
      return dirResult;
    }
    const filePath = getNotifyIdsFile();
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
    sdk.console.log("Notify IDs saved successfully");
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save notify IDs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const getNotifyIds = async (sdk: SDK): Promise<Result<NotifyConfig>> => {
  try {
    if (sdk.storage) {
      const stored = await sdk.storage.get("notify-ids");
      if (stored === undefined) {
        return { kind: "Ok", value: {} };
      }
      const config = JSON.parse(stored) as NotifyConfig;
      return { kind: "Ok", value: config };
    }
    const filePath = getNotifyIdsFile();
    await ensureConfigDir();
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const config = JSON.parse(content) as NotifyConfig;
      return { kind: "Ok", value: config };
    } catch {
      return { kind: "Ok", value: {} };
    }
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to read notify IDs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveProviderConfig = async (sdk: SDK, yamlContent: string): Promise<Result<void>> => {
  const dirResult = await ensureConfigDir();
  if (dirResult.kind === "Error") {
    return dirResult;
  }

  try {
    const filePath = getProviderConfigFile();
    await fs.writeFile(filePath, yamlContent, "utf-8");
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save provider config: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const getProviderConfig = async (sdk: SDK): Promise<Result<string>> => {
  try {
    const filePath = getProviderConfigFile();
    await ensureConfigDir();
    
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { kind: "Ok", value: content };
    } catch (readError) {
      const err = readError as { code?: string; message?: string };
      const errorMsg = err.message || String(readError);
      if (err.code === "ENOENT" || errorMsg.includes("No such file") || errorMsg.includes("ENOENT")) {
        return { kind: "Ok", value: "" };
      }
      throw readError;
    }
  } catch (error) {
    const err = error as { code?: string; message?: string };
    const errorMsg = err.message || String(error);
    if (err.code === "ENOENT" || errorMsg.includes("No such file") || errorMsg.includes("ENOENT")) {
      return { kind: "Ok", value: "" };
    }
    return {
      kind: "Error",
      error: `Failed to read provider config: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const getExcludedFindings = async (sdk: SDK): Promise<Result<string[]>> => {
  try {
    if (sdk.storage) {
      const stored = await sdk.storage.get("excluded-findings");
      if (stored === undefined) {
        return { kind: "Ok", value: [] };
      }
      const excluded = JSON.parse(stored) as string[];
      return { kind: "Ok", value: excluded };
    }
    const filePath = getExcludedFindingsFile();
    await ensureConfigDir();
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const excluded = JSON.parse(content) as string[];
      return { kind: "Ok", value: excluded };
    } catch {
      return { kind: "Ok", value: [] };
    }
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to read excluded findings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveExcludedFindings = async (sdk: SDK, excluded: string[]): Promise<Result<void>> => {
  try {
    if (sdk.storage) {
      await sdk.storage.set("excluded-findings", JSON.stringify(excluded));
      return { kind: "Ok", value: undefined };
    }
    const dirResult = await ensureConfigDir();
    if (dirResult.kind === "Error") {
      return dirResult;
    }
    const filePath = getExcludedFindingsFile();
    await fs.writeFile(filePath, JSON.stringify(excluded, null, 2), "utf-8");
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save excluded findings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

type SentFinding = {
  findingId: string;
  timestamp: number;
};

let sentFindingsCache: SentFinding[] = [];

const getSentFindings = async (sdk: SDK): Promise<Result<SentFinding[]>> => {
  try {
    if (sentFindingsCache === undefined || sentFindingsCache === null) {
      sentFindingsCache = [];
    }
    return { kind: "Ok", value: [...sentFindingsCache] };
  } catch (error) {
    sdk.console.error(`Error reading sent findings: ${error instanceof Error ? error.message : String(error)}`);
    return {
      kind: "Error",
      error: `Failed to read sent findings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveSentFindings = async (sdk: SDK, sent: SentFinding[]): Promise<Result<void>> => {
  try {
    if (sentFindingsCache === undefined || sentFindingsCache === null) {
      sentFindingsCache = [];
    }
    sentFindingsCache = [...sent];
    return { kind: "Ok", value: undefined };
  } catch (error) {
    sdk.console.error(`Error saving sent findings: ${error instanceof Error ? error.message : String(error)}`);
    return {
      kind: "Error",
      error: `Failed to save sent findings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const clearSentFindings = async (sdk: SDK): Promise<Result<void>> => {
  try {
    sentFindingsCache = [];
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to clear sent findings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

let checkDelayCache = 60000;

const getCheckDelay = async (sdk: SDK): Promise<Result<number>> => {
  try {
    return { kind: "Ok", value: checkDelayCache };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to read check delay: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveCheckDelay = async (sdk: SDK, delay: number): Promise<Result<void>> => {
  try {
    if (delay < 1000) {
      return { kind: "Error", error: "Delay must be at least 1000ms (1 second)" };
    }
    checkDelayCache = delay;
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save check delay: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

let useCustomProviderConfigCache = true;

const getUseCustomProviderConfig = async (sdk: SDK): Promise<Result<boolean>> => {
  try {
    return { kind: "Ok", value: useCustomProviderConfigCache };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to read useCustomProviderConfig: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveUseCustomProviderConfig = async (sdk: SDK, useCustom: boolean): Promise<Result<void>> => {
  try {
    useCustomProviderConfigCache = useCustom;
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save useCustomProviderConfig: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const addExcludedFinding = async (sdk: SDK, findingId: string): Promise<Result<void>> => {
  const excludedResult = await getExcludedFindings(sdk);
  if (excludedResult.kind === "Error") {
    return excludedResult;
  }

  const excluded = excludedResult.value;
  if (!excluded.includes(findingId)) {
    excluded.push(findingId);
    return await saveExcludedFindings(sdk, excluded);
  }

  return { kind: "Ok", value: undefined };
};

const removeExcludedFinding = async (sdk: SDK, findingId: string): Promise<Result<void>> => {
  const excludedResult = await getExcludedFindings(sdk);
  if (excludedResult.kind === "Error") {
    return excludedResult;
  }

  const excluded = excludedResult.value.filter((id) => id !== findingId);
  return await saveExcludedFindings(sdk, excluded);
};

const sendNotification = async (
  sdk: SDK,
  message: string,
  reporter?: string,
): Promise<Result<void>> => {
  const idsResult = await getNotifyIds(sdk);
  if (idsResult.kind === "Error") {
    return idsResult;
  }

  const config = idsResult.value;
  let notifyIds = config.defaultIds || "";
  let idsType = config.defaultIdsType || "id";

  if (config.customFindingIds && reporter) {
    // Check for custom ID (case-insensitive match)
    const reporterKey = Object.keys(config.customFindingIds).find(
      (key) => key.toLowerCase() === reporter.toLowerCase()
    );
    if (reporterKey !== undefined) {
      const customId = config.customFindingIds[reporterKey];
      if (customId !== undefined) {
        notifyIds = customId;
        const customType = config.customFindingIdsType?.[reporterKey];
        if (customType !== undefined) {
          idsType = customType;
        }
      }
    }
  }

  if (!notifyIds) {
    return { kind: "Error", error: "No notify IDs configured" };
  }

    return new Promise(async (resolve) => {
      const useCustomResult = await getUseCustomProviderConfig(sdk);
      const useCustom = useCustomResult.kind === "Ok" ? useCustomResult.value : true;
      const providerConfigPath = useCustom
        ? getProviderConfigFile()
        : getDefaultNotifyProviderConfigFile();
      const flag = idsType === "provider" ? "-provider" : "-id";
      const args = ["-provider-config", providerConfigPath, flag, notifyIds, "-bulk"];

      const notifyCmd = getNotifyCommand();
      const proc = spawn(notifyCmd, args, {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
      });

    let errorOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    proc.on("close", (code: number | undefined) => {
      if (code === 0) {
        resolve({ kind: "Ok", value: undefined });
      } else {
        resolve({
          kind: "Error",
          error: `Notify command failed with code ${code}: ${errorOutput}`,
        });
      }
    });

    proc.on("error", (error: Error) => {
      resolve({
        kind: "Error",
        error: `Failed to execute notify: ${error instanceof Error ? error.message : String(error)}`,
      });
    });

    proc.stdin?.write(message);
    proc.stdin?.end();
  });
};

const checkAndSendFindings = async (sdk: SDK): Promise<Result<void>> => {
  const excludedResult = await getExcludedFindings(sdk);
  if (excludedResult.kind === "Error") {
    return excludedResult;
  }

  const sentResult = await getSentFindings(sdk);
  if (sentResult.kind === "Error") {
    return sentResult;
  }

  const excluded = new Set(excludedResult.value);
  
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  
  const sentFindings = sentResult.value || [];
  
  if (sentFindingsCache === undefined || sentFindingsCache === null) {
    sentFindingsCache = [];
  }
  
  const sentIds = new Set<string>();
  if (sentFindings.length > 0) {
    for (const finding of sentFindings) {
      if (finding.findingId !== undefined && finding.findingId !== null) {
        sentIds.add(finding.findingId);
      }
    }
  }
  
  const cleanedSentFindings = sentFindings.filter((f) => f.timestamp > oneHourAgo);
  
  if (cleanedSentFindings.length !== sentFindings.length) {
    await saveSentFindings(sdk, cleanedSentFindings);
  }
  
  const finalSentIds = new Set(cleanedSentFindings.map((f) => f.findingId));

  try {
    const query = `
      query GetFindings {
        findings {
          nodes {
            id
            title
            description
            reporter
            host
            path
            createdAt
          }
        }
      }
    `;

    const response = await sdk.graphql.execute<{
      findings?: {
        nodes?: Array<{
          id: string;
          title: string;
          description?: string;
          reporter: string;
          host: string;
          path: string;
          createdAt?: string;
        }>;
      };
    }>(query);

    if (response.errors && response.errors.length > 0) {
      sdk.console.error("GraphQL errors:", JSON.stringify(response.errors, null, 2));
      return {
        kind: "Error",
        error: `GraphQL query failed: ${response.errors.map((e: { message: string }) => e.message).join(", ")}`,
      };
    }

    if (!response.data?.findings?.nodes) {
      return { kind: "Ok", value: undefined };
    }

    const allFindings = response.data.findings.nodes.map((f: {
      id: string;
      title: string;
      description?: string;
      reporter: string;
      host: string;
      path: string;
      createdAt?: string;
    }) => {
      let findingTimestamp = now;
      if (f.createdAt) {
        const parsed = new Date(f.createdAt).getTime();
        if (!isNaN(parsed)) {
          findingTimestamp = parsed;
        }
      }
      return {
        getId: () => f.id,
        getTitle: () => f.title,
        getDescription: () => f.description || "",
        getReporter: () => f.reporter,
        getTimestamp: () => findingTimestamp,
      };
    });

    type FindingWithTimestamp = {
      getId: () => string;
      getTitle: () => string;
      getDescription: () => string;
      getReporter: () => string;
      getTimestamp: () => number;
    };

    const recentFindings = allFindings.filter((finding: FindingWithTimestamp) => {
      return finding.getTimestamp() > oneHourAgo;
    });

    const newFindings = recentFindings.filter((finding: FindingWithTimestamp) => {
      const findingId = finding.getId();
      const reporter = finding.getReporter();
      // Check if excluded by finding ID or reporter name
      const isExcludedById = excluded.has(findingId);
      const isExcludedByReporter = excluded.has(reporter);
      return !isExcludedById && !isExcludedByReporter && !finalSentIds.has(findingId);
    });

    if (newFindings.length === 0) {
      return { kind: "Ok", value: undefined };
    }

    const newSentFindings: SentFinding[] = [];

    for (const finding of newFindings) {
      const findingId = finding.getId();
      const timestamp = finding.getTimestamp();
      newSentFindings.push({ findingId, timestamp });
    }

    // Save findings immediately to cache before sending (so they're marked as sent even if notify fails)
    const updatedSent = [...cleanedSentFindings, ...newSentFindings];
    await saveSentFindings(sdk, updatedSent);

    const idsResult = await getNotifyIds(sdk);
    if (idsResult.kind === "Error") {
      return idsResult;
    }

    const config = idsResult.value;
    const defaultNotifyIds = config.defaultIds || "";
    const defaultIdsType = config.defaultIdsType || "id";

    if (!defaultNotifyIds) {
      return { kind: "Error", error: "No notify IDs configured" };
    }

    const useCustomResult = await getUseCustomProviderConfig(sdk);
    const useCustom = useCustomResult.kind === "Ok" ? useCustomResult.value : true;
    const providerConfigPath = useCustom
      ? getProviderConfigFile()
      : getDefaultNotifyProviderConfigFile();

    // Group findings by reporter to use custom IDs when available 
    const findingsByReporter = new Map<string, typeof newFindings>();
    for (const finding of newFindings) {
      const reporter = finding.getReporter();
      const existing = findingsByReporter.get(reporter) || [];
      existing.push(finding);
      findingsByReporter.set(reporter, existing);
    }
    // It seem to be more faster to group by reporter than to send each finding separately 
    // Still check the limit of notify so too fast can be an issue too stay like this for now
    // Send findings grouped by reporter, using custom IDs when available
    const sendPromises: Promise<Result<void>>[] = [];
    
    for (const [reporter, reporterFindings] of findingsByReporter.entries()) {
      // Check if this reporter has a custom ID configured
      let notifyIds = defaultNotifyIds;
      let idsType = defaultIdsType;
      
      // Check for custom ID (case-insensitive match)
      if (config.customFindingIds) {
        const reporterKey = Object.keys(config.customFindingIds).find(
          (key) => key.toLowerCase() === reporter.toLowerCase()
        );
        if (reporterKey !== undefined) {
          const customId = config.customFindingIds[reporterKey];
          if (customId !== undefined) {
            notifyIds = customId;
            idsType = config.customFindingIdsType?.[reporterKey] || defaultIdsType;
          }
        }
      }

      const messages: string[] = [];
      for (const finding of reporterFindings) {
        const findingId = finding.getId();
        const title = finding.getTitle();
        const description = finding.getDescription();
        const message = `🔔 New Finding: ${title}\n\nReporter: ${reporter}\n\n${description}\n\nFinding ID: ${findingId}`;
        messages.push(message);
      }

      const bulkMessage = messages.join("\n\n---\n\n");
      const flag = idsType === "provider" ? "-provider" : "-id";
      const args = ["-provider-config", providerConfigPath, flag, notifyIds, "-bulk"];

      const sendPromise = new Promise<Result<void>>((resolve) => {
        const notifyCmd = getNotifyCommand();
        const proc = spawn(notifyCmd, args, {
          shell: true,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let errorOutput = "";

        proc.stderr?.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        const timeout = setTimeout(() => {
          resolve({ kind: "Ok", value: undefined });
        }, 30000);

        proc.on("close", async (code: number | undefined) => {
          clearTimeout(timeout);
          
          if (code !== 0) {
            sdk.console.error(`Notify command failed for reporter "${reporter}" with code ${code}: ${errorOutput}`);
          }
          resolve({ kind: "Ok", value: undefined });
        });

        proc.on("error", (error: Error) => {
          sdk.console.error(`Notify process error for reporter "${reporter}": ${error instanceof Error ? error.message : String(error)}`);
          resolve({
            kind: "Error",
            error: `Failed to execute notify: ${error instanceof Error ? error.message : String(error)}`,
          });
        });

        if (proc.stdin) {
          proc.stdin.write(bulkMessage);
          proc.stdin.end();
        }
      });

      sendPromises.push(sendPromise);
    }

    
    await Promise.all(sendPromises);

    
    sdk.events.emit("findings-sent", {
      count: newSentFindings.length,
      totalCount: updatedSent.length,
    });

    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to check findings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const manualCheckFindings = async (sdk: SDK): Promise<Result<string>> => {
  const result = await checkAndSendFindings(sdk);
  if (result.kind === "Error") {
    return { kind: "Error", error: result.error };
  }
  return { kind: "Ok", value: "Findings checked successfully" };
};

export type API = DefineAPI<{
  checkNotifyInstalled: typeof checkNotifyInstalled;
  saveNotifyIds: typeof saveNotifyIds;
  getNotifyIds: typeof getNotifyIds;
  saveProviderConfig: typeof saveProviderConfig;
  getProviderConfig: typeof getProviderConfig;
  sendNotification: typeof sendNotification;
  getExcludedFindings: typeof getExcludedFindings;
  addExcludedFinding: typeof addExcludedFinding;
  removeExcludedFinding: typeof removeExcludedFinding;
  manualCheckFindings: typeof manualCheckFindings;
  getCheckDelay: typeof getCheckDelay;
  saveCheckDelay: typeof saveCheckDelay;
  getSentFindings: typeof getSentFindings;
  clearSentFindings: typeof clearSentFindings;
  getUseCustomProviderConfig: typeof getUseCustomProviderConfig;
  saveUseCustomProviderConfig: typeof saveUseCustomProviderConfig;
}>;

let checkInterval: ReturnType<typeof setInterval> | undefined;

const startCheckingFindings = async (sdk: SDK<API>) => {
  if (checkInterval !== undefined) {
    clearInterval(checkInterval);
  }

  const delayResult = await getCheckDelay(sdk);
  const delay = delayResult.kind === "Ok" ? delayResult.value : 60000;

  checkInterval = setInterval(async () => {
    const result = await checkAndSendFindings(sdk);
    if (result.kind === "Error") {
      sdk.console.error(`Error checking findings: ${result.error}`);
    }
  }, delay);

};

export function init(sdk: SDK<API, BackendEvents>) {
  sdk.api.register("checkNotifyInstalled", checkNotifyInstalled);
  sdk.api.register("saveNotifyIds", saveNotifyIds);
  sdk.api.register("getNotifyIds", getNotifyIds);
  sdk.api.register("saveProviderConfig", saveProviderConfig);
  sdk.api.register("getProviderConfig", getProviderConfig);
  sdk.api.register("sendNotification", sendNotification);
  sdk.api.register("getExcludedFindings", getExcludedFindings);
  sdk.api.register("addExcludedFinding", addExcludedFinding);
  sdk.api.register("removeExcludedFinding", removeExcludedFinding);
  sdk.api.register("manualCheckFindings", manualCheckFindings);
  sdk.api.register("getCheckDelay", getCheckDelay);
  sdk.api.register("saveCheckDelay", async (sdk: SDK, delay: number) => {
    const result = await saveCheckDelay(sdk, delay);
    if (result.kind === "Ok") {
      await startCheckingFindings(sdk);
    }
    return result;
  });
  sdk.api.register("getSentFindings", getSentFindings);
  sdk.api.register("clearSentFindings", clearSentFindings);
  sdk.api.register("getUseCustomProviderConfig", getUseCustomProviderConfig);
  sdk.api.register("saveUseCustomProviderConfig", saveUseCustomProviderConfig);

  startCheckingFindings(sdk);
}



// TODO CHECK THE LIMIT BEFORE NOTIFY FF
//rerun test of speed on a large sample of findings
//rerun test of speed on a large sample projects with many and not so many findings