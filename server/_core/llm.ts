import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  model?: string;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveBaseApiUrl = () => {
  const apiUrl = process.env.BUILT_IN_FORGE_API_URL || ENV.forgeApiUrl;
  if (apiUrl && apiUrl.trim().length > 0) {
    // Strip trailing /v1 or slash to get the base host
    return apiUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  }
  return "https://forge.manus.im";
};

const resolveApiUrl = () => `${resolveBaseApiUrl()}/v1/chat/completions`;

const getApiKey = () => {
  return process.env.BUILT_IN_FORGE_API_KEY || ENV.forgeApiKey;
};

const assertApiKey = () => {
  if (!getApiKey()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// =============================================================================
// CACHING - Models cache to avoid repeated API calls
// =============================================================================
interface ModelsCache {
  models: string[];
  timestamp: number;
  ttl: number; // Time-to-live in milliseconds
}

let modelsCache: ModelsCache | null = null;
const MODELS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedModels(): string[] | null {
  if (!modelsCache) return null;
  if (Date.now() - modelsCache.timestamp > modelsCache.ttl) {
    modelsCache = null;
    return null;
  }
  return modelsCache.models;
}

function setCachedModels(models: string[]): void {
  modelsCache = {
    models,
    timestamp: Date.now(),
    ttl: MODELS_CACHE_TTL,
  };
}

/** Clear the models cache (useful for testing or manual refresh) */
export function clearModelsCache(): void {
  modelsCache = null;
}

export async function fetchAvailableModels(): Promise<string[]> {
  // Check cache first
  const cached = getCachedModels();
  if (cached) {
    return cached;
  }

  const baseUrl = resolveBaseApiUrl();
  
  // Try multiple endpoints for different providers
  // Ollama native: /api/tags, OpenAI-compatible: /v1/models, generic: /models
  const endpoints = [
    `${baseUrl}/api/tags`,      // Ollama native API
    `${baseUrl}/v1/models`,     // OpenAI-compatible
    `${baseUrl}/models`,        // Generic
  ];

  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = getApiKey();
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers, method: "GET" });
      if (!response.ok) continue;

      const data = await response.json() as Record<string, unknown>;
      
      // Handle Ollama format: { models: [{ name: "model:tag" }] }
      if (Array.isArray(data.models)) {
        const models = (data.models as Array<{ name?: string; model?: string; id?: string }>)
          .map((m) => m.name || m.model || m.id)
          .filter((m): m is string => Boolean(m && m.trim().length > 0));
        if (models.length > 0) {
          setCachedModels(models);
          return models;
        }
      }
      
      // Handle OpenAI format: { data: [{ id: "model-name" }] }
      if (Array.isArray(data.data)) {
        const models = (data.data as Array<{ id?: string; name?: string }>)
          .map((m) => m.id || m.name)
          .filter((m): m is string => Boolean(m && m.trim().length > 0));
        if (models.length > 0) {
          setCachedModels(models);
          return models;
        }
      }
    } catch (error) {
      // Try next endpoint
      continue;
    }
  }

  console.error("[LLM] fetchAvailableModels: all endpoints failed, using fallback");
  // Safe fallback so UI still works
  const fallback = ["deepseek-v3.1:671b-cloud"];
  setCachedModels(fallback); // Cache fallback to avoid repeated failures
  return fallback;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: params.model || process.env.LLM_MODEL || "deepseek-v3.1:671b-cloud",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const maxTokens = params.maxTokens || params.max_tokens || 4096;
  payload.max_tokens = maxTokens;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}
