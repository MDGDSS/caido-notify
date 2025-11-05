<script setup lang="ts">
import Button from "primevue/button";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import Textarea from "primevue/textarea";
import InputText from "primevue/inputtext";
import Dropdown from "primevue/dropdown";
import Checkbox from "primevue/checkbox";
import { ref, onMounted, onUnmounted } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

const defaultIds = ref("");
const defaultIdsType = ref<"id" | "provider">("id");
const customFindingIds = ref<Record<string, string>>({});
const customFindingIdsType = ref<Record<string, "id" | "provider">>({});
const customReporterKey = ref("");
const customReporterId = ref("");
const customReporterType = ref<"id" | "provider">("id");
const providerConfig = ref("");
const isSavingIds = ref(false);
const isSavingConfig = ref(false);
const isCheckingFindings = ref(false);
const excludedFindings = ref<string[]>([]);
const excludedFindingId = ref("");
const checkDelay = ref(60);
const sentFindings = ref<Array<{ findingId: string; timestamp: number }>>([]);
const useCustomProviderConfig = ref(true);

const idTypeOptions = [
  { label: "ID", value: "id" },
  { label: "Provider", value: "provider" },
];

const loadConfig = async () => {
  const idsResult = await sdk.backend.getNotifyIds();
  if (idsResult.kind === "Ok") {
    defaultIds.value = idsResult.value.defaultIds || "";
    defaultIdsType.value = idsResult.value.defaultIdsType || "id";
    customFindingIds.value = idsResult.value.customFindingIds || {};
    customFindingIdsType.value = idsResult.value.customFindingIdsType || {};
  }

  const configResult = await sdk.backend.getProviderConfig();
  if (configResult.kind === "Ok") {
    providerConfig.value = configResult.value;
  }

  const excludedResult = await sdk.backend.getExcludedFindings();
  if (excludedResult.kind === "Ok") {
    excludedFindings.value = excludedResult.value;
  }

  const delayResult = await sdk.backend.getCheckDelay();
  if (delayResult.kind === "Ok") {
    checkDelay.value = Math.floor(delayResult.value / 1000);
  }

  const useCustomResult = await sdk.backend.getUseCustomProviderConfig();
  if (useCustomResult.kind === "Ok") {
    useCustomProviderConfig.value = useCustomResult.value;
  }
};

const checkNotify = async () => {
  isCheckingNotify.value = true;
  notifyInstalled.value = undefined;

  const result = await sdk.backend.checkNotifyInstalled();

  if (result.kind === "Ok") {
    notifyInstalled.value = result.value;
    if (result.value) {
      sdk.window.showToast("Notify is installed", { variant: "success" });
    } else {
      sdk.window.showToast("Notify is not installed", { variant: "error" });
    }
  } else {
    sdk.window.showToast(result.error, { variant: "error" });
  }

  isCheckingNotify.value = false;
};

const addCustomFindingId = () => {
  if (customReporterKey.value && customReporterId.value) {
    customFindingIds.value[customReporterKey.value] = customReporterId.value;
    customFindingIdsType.value[customReporterKey.value] = customReporterType.value;
    customReporterKey.value = "";
    customReporterId.value = "";
    customReporterType.value = "id";
  }
};

const removeCustomFindingId = (key: string) => {
  delete customFindingIds.value[key];
  delete customFindingIdsType.value[key];
};

const addExcludedFinding = async () => {
  if (!excludedFindingId.value) {
    return;
  }

  const result = await sdk.backend.addExcludedFinding(excludedFindingId.value);
  if (result.kind === "Ok") {
    excludedFindings.value.push(excludedFindingId.value);
    excludedFindingId.value = "";
    sdk.window.showToast("Finding excluded", { variant: "success" });
  } else {
    sdk.window.showToast(result.error, { variant: "error" });
  }
};

const removeExcludedFinding = async (findingId: string) => {
  const result = await sdk.backend.removeExcludedFinding(findingId);
  if (result.kind === "Ok") {
    excludedFindings.value = excludedFindings.value.filter((id) => id !== findingId);
    sdk.window.showToast("Finding removed from exclude list", { variant: "success" });
  } else {
    sdk.window.showToast(result.error, { variant: "error" });
  }
};

const saveNotifyIds = async () => {
  isSavingIds.value = true;

  const idsResult = await sdk.backend.saveNotifyIds({
    defaultIds: defaultIds.value,
    defaultIdsType: defaultIdsType.value,
    customFindingIds: customFindingIds.value,
    customFindingIdsType: customFindingIdsType.value,
  });

  if (idsResult.kind === "Error") {
    sdk.window.showToast(idsResult.error, { variant: "error" });
    isSavingIds.value = false;
    return;
  }

  const delaySeconds = Number.parseInt(String(checkDelay.value), 10);
  if (!isNaN(delaySeconds) && delaySeconds >= 1) {
    const delayMs = delaySeconds * 1000;
    const delayResult = await sdk.backend.saveCheckDelay(delayMs);
    if (delayResult.kind === "Error") {
      sdk.window.showToast(`Configuration saved but delay failed: ${delayResult.error}`, { variant: "error" });
      isSavingIds.value = false;
      return;
    }
  } else {
    sdk.window.showToast("Invalid delay value. Using default 60 seconds.", { variant: "warning" });
  }

  sdk.window.showToast("Configuration saved successfully", { variant: "success" });
  isSavingIds.value = false;
};

const manualCheckFindings = async () => {
  isCheckingFindings.value = true;

  // Sync before checking findings
  await syncSentFindingsToStorage();

  const result = await sdk.backend.manualCheckFindings();

  if (result.kind === "Ok") {
    await syncSentFindingsToStorage();
    sdk.window.showToast(result.value, { variant: "success" });
  } else {
    sdk.window.showToast(result.error, { variant: "error" });
  }

  isCheckingFindings.value = false;
};

const saveProviderConfig = async () => {
  isSavingConfig.value = true;

  const saveCustomFlagResult = await sdk.backend.saveUseCustomProviderConfig(useCustomProviderConfig.value);
  if (saveCustomFlagResult.kind === "Error") {
    sdk.window.showToast(`Failed to save custom config flag: ${saveCustomFlagResult.error}`, { variant: "error" });
    isSavingConfig.value = false;
    return;
  }

  const result = await sdk.backend.saveProviderConfig(providerConfig.value);

  if (result.kind === "Ok") {
    sdk.window.showToast("Provider config saved successfully", {
      variant: "success",
    });
  } else {
    sdk.window.showToast(result.error, { variant: "error" });
  }

  isSavingConfig.value = false;
};

const clearSentFindings = async () => {
  const result = await sdk.backend.clearSentFindings();
  if (result.kind === "Ok") {
    sentFindings.value = [];
    await syncSentFindingsToStorage();
    sdk.window.showToast("Sent findings cleared successfully", { variant: "success" });
  } else {
    sdk.window.showToast(result.error, { variant: "error" });
  }
};

const syncSentFindingsToStorage = async () => {
  try {
    const sentFindingsResult = await sdk.backend.getSentFindings();
    if (sentFindingsResult.kind === "Ok") {
      const findings = sentFindingsResult.value || [];
      sentFindings.value = findings;
    }
  } catch (e) {
    console.error("Failed to sync sent findings:", e);
  }
};

onMounted(() => {
  loadConfig();
  syncSentFindingsToStorage();
  
  const eventSubscription = sdk.backend.onEvent("findings-sent", () => {
    syncSentFindingsToStorage();
  });
  
  onUnmounted(() => {
    eventSubscription.stop();
  });
});
</script>

<template>
  <div class="h-full flex flex-col p-4 gap-4">
    <h1 class="text-xl font-semibold">Notify Configuration</h1>

    <div class="flex items-start relative">
      <TabView class="flex-1">
        <TabPanel header="Notify IDs">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-col gap-2">
            <label class="font-medium">Check Delay (seconds)</label>
            <InputText
              v-model.number="checkDelay"
              type="number"
              placeholder="60"
              class="w-full"
            />
            <p class="text-sm text-gray-500">
              Time between automatic findings checks in seconds (default: 60, minimum: 1 second)
            </p>
          </div>

          <div class="flex flex-col gap-2">
            <label class="font-medium">Where to send</label>
            <div class="flex gap-2">
              <Textarea
                v-model="defaultIds"
                placeholder="where to send"
                rows="1"
                class="flex-1"
                style="min-height: 2.5rem;"
              />
              <Dropdown
                v-model="defaultIdsType"
                :options="idTypeOptions"
                option-label="label"
                option-value="value"
                class="w-40"
              />
            </div>
            <p class="text-sm text-gray-500">
              Default IDs to use when sending notifications. Select "ID" for -id flag or "Provider" for -provider flag.
            </p>
          </div>

          <div class="flex flex-col gap-2">
            <label class="font-medium">Custom Finding IDs</label>
            <p class="text-sm text-gray-500">
              Configure different notify IDs based on finding reporter
            </p>
            <div class="flex gap-2">
              <InputText
                v-model="customReporterKey"
                placeholder="Reporter name"
                class="flex-1"
              />
              <InputText
                v-model="customReporterId"
                placeholder="Notify ID(s)"
                class="flex-1"
              />
              <Dropdown
                v-model="customReporterType"
                :options="idTypeOptions"
                option-label="label"
                option-value="value"
                class="w-32"
              />
              <Button label="Add" @click="addCustomFindingId" />
            </div>

            <div v-if="Object.keys(customFindingIds).length > 0" class="mt-2 space-y-2">
              <div
                v-for="(id, reporter) in customFindingIds"
                :key="reporter"
                class="flex items-center justify-between p-2 bg-surface-700 rounded"
              >
                <span class="font-medium text-surface-100">{{ reporter }}</span>
                <span class="text-surface-200">{{ id }}</span>
                <span class="text-sm text-surface-300">{{ customFindingIdsType[reporter] || "id" }}</span>
                <Button
                  label="Remove"
                  severity="danger"
                  size="small"
                  @click="removeCustomFindingId(reporter)"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="font-medium">Excluded Findings</label>
            <p class="text-sm text-gray-500">
              Findings in this list will not be sent to notify. You can exclude by Finding ID or Reporter name (e.g., "Enhanced File Detector")
            </p>
            <div class="flex gap-2">
              <InputText
                v-model="excludedFindingId"
                placeholder="Finding ID or Reporter name to exclude"
                class="flex-1"
                @keyup.enter="addExcludedFinding"
              />
              <Button label="Add" @click="addExcludedFinding" />
            </div>

            <div v-if="excludedFindings.length > 0" class="mt-2 space-y-2">
              <div
                v-for="findingId in excludedFindings"
                :key="findingId"
                class="flex items-center justify-between p-2 bg-surface-700 rounded"
              >
                <span class="font-mono text-sm text-surface-100">{{ findingId }}</span>
                <Button
                  label="Remove"
                  severity="danger"
                  size="small"
                  @click="removeExcludedFinding(findingId)"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2 mt-4">
            <Button
              label="Save Configuration"
              @click="saveNotifyIds"
              :loading="isSavingIds"
            />
          </div>
        </div>
        </TabPanel>

        <TabPanel header="Provider Config">
        <div class="flex flex-col gap-4 p-4 h-full">
          <div class="flex items-center gap-2">
            <Checkbox
              v-model="useCustomProviderConfig"
              input-id="useCustomProviderConfig"
              :binary="true"
            />
            <label for="useCustomProviderConfig" class="font-medium">Use custom configuration</label>
          </div>
          <div class="flex flex-col gap-2 flex-1">
            <label class="font-medium">Provider Configuration YAML</label>
            <Textarea
              v-model="providerConfig"
              placeholder="Paste your provider-config.yaml content here..."
              :rows="20"
              :disabled="!useCustomProviderConfig"
              class="w-full font-mono text-sm"
              :class="{ 'opacity-50': !useCustomProviderConfig }"
            />
            <p class="text-sm text-gray-500">
              <span v-if="useCustomProviderConfig">
                This is the provider configuration file used by notify. Paste your
                provider-config.yaml content here.
              </span>
              <span v-else>
                Using default provider configuration file at ~/.config/notify/provider-config.yaml
              </span>
            </p>
          </div>

          <Button
            label="Save Provider Config"
            @click="saveProviderConfig"
            :loading="isSavingConfig"
          />
        </div>
        </TabPanel>
      </TabView>
      <div class="absolute" style="top: 0; right: 0; z-index: 10;">
        <Button
          label="Clear Sent Findings"
          @click="clearSentFindings"
          severity="danger"
          size="small"
        />
      </div>
    </div>
  </div>
</template>
