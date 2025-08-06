import { TEXT2IMAGE_MODELS, type Text2ImageModel } from "./text2image-models";

// Types for API responses
interface FalImageResponse {
  // Most models return images array
  images?: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
  // WAN v2.2 returns single image object
  image?: {
    url: string;
    width: number;
    height: number;
    content_type?: string;
  };
  timings?: Record<string, number>;
  seed?: number;
  has_nsfw_concepts?: boolean[];
}

interface GenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
  metadata?: {
    seed?: number;
    timings?: Record<string, number>;
    dimensions?: { width: number; height: number };
  };
}

export interface GenerationSettings {
  imageSize: string;
  seed?: number;
}

// Multi-model generation result
export type MultiModelGenerationResult = Record<string, GenerationResult>;

class FalAIClient {
  private apiKey: string | null = null;
  private baseUrl = "https://fal.run";

  constructor() {
    // Try to get API key from environment variables
    this.apiKey =
      import.meta.env.VITE_FAL_API_KEY ||
      process.env.FAL_API_KEY ||
      (typeof window !== "undefined" &&
        (window as any).process?.env?.FAL_API_KEY) ||
      null;

    if (!this.apiKey) {
      console.warn(
        "[FalAI] No API key found. Set VITE_FAL_API_KEY environment variable to enable text-to-image generation."
      );
    }
  }

  private async makeRequest(
    endpoint: string,
    params: Record<string, any>
  ): Promise<FalImageResponse> {
    // Check if API key is available
    if (!this.apiKey) {
      throw new Error(
        "FAL API key is required for text-to-image generation. Please set VITE_FAL_API_KEY environment variable."
      );
    }

    // The endpoint already contains the full URL, so use it directly
    const requestUrl = endpoint.startsWith("https://")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    console.log("[FalAI] Making direct API request to:", requestUrl);
    console.log("[FalAI] Request params:", params);

    // Make direct API call to fal.run instead of proxy
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${this.apiKey}`,
      },
      body: JSON.stringify(params),
    });

    console.log("[FalAI] Response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[FalAI] API request failed:", errorData);

      // Handle different error response formats
      let errorMessage = `API request failed: ${response.status}`;

      if (errorData.error) {
        if (typeof errorData.error === "string") {
          errorMessage = errorData.error;
        } else if (typeof errorData.error === "object") {
          errorMessage = JSON.stringify(errorData.error, null, 2);
        }
      } else if (errorData.detail) {
        if (typeof errorData.detail === "string") {
          errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((d: any) => d.msg || JSON.stringify(d))
            .join(", ");
        } else {
          errorMessage = JSON.stringify(errorData.detail, null, 2);
        }
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log("[FalAI] API response:", result);
    return result;
  }

  private convertSettingsToParams(
    model: Text2ImageModel,
    prompt: string,
    settings: GenerationSettings
  ): Record<string, any> {
    const params: Record<string, any> = {
      prompt,
      ...model.defaultParams,
    };

    // Add seed if provided
    if (settings.seed !== undefined && settings.seed !== null) {
      params.seed = settings.seed;
    }

    // Convert generic settings to model-specific parameters
    switch (model.id) {
      case "imagen4-ultra":
        // Imagen4 uses aspect_ratio - map from size format to aspect ratio
        switch (settings.imageSize) {
          case "square":
          case "square_hd":
            params.aspect_ratio = "1:1";
            break;
          case "portrait_4_3":
            params.aspect_ratio = "3:4";
            break;
          case "portrait_16_9":
            params.aspect_ratio = "9:16";
            break;
          case "landscape_4_3":
            params.aspect_ratio = "4:3";
            break;
          case "landscape_16_9":
            params.aspect_ratio = "16:9";
            break;
          default:
            params.aspect_ratio = "1:1";
        }
        break;

      case "seeddream-v3":
        // SeedDream v3 uses image_size (predefined values or custom)
        params.image_size = settings.imageSize;
        break;

      case "wan-v2-2":
        // WAN v2.2 uses image_size like SeedDream v3
        params.image_size = settings.imageSize;
        break;

      case "qwen-image":
        // Qwen Image uses image_size parameter
        params.image_size = settings.imageSize;
        break;

      case "flux-pro-v11-ultra":
        // FLUX Pro uses aspect_ratio
        switch (settings.imageSize) {
          case "square":
          case "square_hd":
            params.aspect_ratio = "1:1";
            break;
          case "portrait_4_3":
            params.aspect_ratio = "3:4";
            break;
          case "portrait_16_9":
            params.aspect_ratio = "9:16";
            break;
          case "landscape_4_3":
            params.aspect_ratio = "4:3";
            break;
          case "landscape_16_9":
            params.aspect_ratio = "16:9";
            break;
          default:
            params.aspect_ratio = "16:9"; // Default for FLUX
        }
        break;
    }

    return params;
  }

  async generateWithModel(
    modelKey: string,
    prompt: string,
    settings: GenerationSettings
  ): Promise<GenerationResult> {
    try {
      const model = TEXT2IMAGE_MODELS[modelKey];
      if (!model) {
        throw new Error(`Unknown model: ${modelKey}`);
      }

      const params = this.convertSettingsToParams(model, prompt, settings);

      console.log(`Generating with ${model.name}:`, { prompt, params });

      const response = await this.makeRequest(model.endpoint, params);

      let image: { url: string; width: number; height: number };

      // Handle different response formats
      if (modelKey === "wan-v2-2") {
        // WAN v2.2 returns {image: {...}, seed: ...}
        if (!response.image) {
          throw new Error("No image returned from API");
        }
        image = response.image;
      } else {
        // Other models return {images: [...], seed: ...}
        if (!response.images || response.images.length === 0) {
          throw new Error("No images returned from API");
        }
        image = response.images[0];
      }

      return {
        success: true,
        imageUrl: image.url,
        metadata: {
          seed: response.seed,
          timings: response.timings,
          dimensions: {
            width: image.width,
            height: image.height,
          },
        },
      };
    } catch (error) {
      console.error(`Generation failed for ${modelKey}:`, error);

      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async generateWithMultipleModels(
    modelKeys: string[],
    prompt: string,
    settings: GenerationSettings
  ): Promise<MultiModelGenerationResult> {
    console.log(
      `Starting multi-model generation with ${modelKeys.length} models:`,
      modelKeys
    );

    // Create promises for all model generations
    const generationPromises = modelKeys.map(async (modelKey) => {
      const result = await this.generateWithModel(modelKey, prompt, settings);
      return [modelKey, result] as [string, GenerationResult];
    });

    try {
      // Wait for all generations to complete (or fail)
      const results = await Promise.allSettled(generationPromises);

      const finalResults: MultiModelGenerationResult = {};

      results.forEach((result, index) => {
        const modelKey = modelKeys[index];

        if (result.status === "fulfilled") {
          finalResults[modelKey] = result.value[1];
        } else {
          console.error(
            `Model ${modelKey} generation rejected:`,
            result.reason
          );
          finalResults[modelKey] = {
            success: false,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "Generation failed",
          };
        }
      });

      return finalResults;
    } catch (error) {
      console.error("Multi-model generation failed:", error);

      // Return error results for all models
      const errorResults: MultiModelGenerationResult = {};
      modelKeys.forEach((modelKey) => {
        errorResults[modelKey] = {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Multi-model generation failed",
        };
      });

      return errorResults;
    }
  }

  // API key management
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    console.log("[FalAI] API key updated");
  }

  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  getApiKeyStatus(): { hasKey: boolean; source: string } {
    if (!this.apiKey) {
      return { hasKey: false, source: "none" };
    }

    // Determine source of API key
    let source = "unknown";
    if (import.meta.env.VITE_FAL_API_KEY) source = "VITE_FAL_API_KEY";
    else if (process.env.FAL_API_KEY) source = "FAL_API_KEY";
    else if (
      typeof window !== "undefined" &&
      (window as any).process?.env?.FAL_API_KEY
    )
      source = "window.process.env.FAL_API_KEY";
    else source = "manually_set";

    return { hasKey: true, source };
  }

  // Utility methods
  async testModelAvailability(modelKey: string): Promise<boolean> {
    try {
      // Check API key first
      if (!this.hasApiKey()) {
        console.warn("[FalAI] Cannot test model availability: no API key");
        return false;
      }

      const model = TEXT2IMAGE_MODELS[modelKey];
      if (!model) return false;

      // Test with a simple prompt
      const result = await this.generateWithModel(modelKey, "test image", {
        imageSize: "square",
      });

      return result.success;
    } catch (error) {
      console.error(
        `[FalAI] Model availability test failed for ${modelKey}:`,
        error
      );
      return false;
    }
  }

  async estimateGenerationTime(
    modelKeys: string[],
    prompt: string
  ): Promise<Record<string, number>> {
    const estimates: Record<string, number> = {};

    modelKeys.forEach((modelKey) => {
      const model = TEXT2IMAGE_MODELS[modelKey];
      if (model) {
        // Rough estimation based on model speed rating and prompt complexity
        const baseTime = 15; // seconds
        const speedMultiplier = (6 - model.speedRating) * 0.5; // 0.5 to 2.5
        const promptComplexity = Math.min(prompt.split(" ").length / 10, 2); // 0 to 2

        estimates[modelKey] = Math.round(
          baseTime * speedMultiplier * (1 + promptComplexity)
        );
      }
    });

    return estimates;
  }

  async getModelCapabilities(modelKey: string): Promise<{
    available: boolean;
    maxResolution: string;
    estimatedCost: string;
    features: string[];
  } | null> {
    const model = TEXT2IMAGE_MODELS[modelKey];
    if (!model) return null;

    return {
      available: true, // Would check with actual API in real implementation
      maxResolution: model.maxResolution,
      estimatedCost: model.estimatedCost,
      features: model.strengths,
    };
  }
}

// Export singleton instance
export const falAIClient = new FalAIClient();

// Export main functions for easy importing
export async function generateWithModel(
  modelKey: string,
  prompt: string,
  settings: GenerationSettings
): Promise<GenerationResult> {
  return falAIClient.generateWithModel(modelKey, prompt, settings);
}

export async function generateWithMultipleModels(
  modelKeys: string[],
  prompt: string,
  settings: GenerationSettings
): Promise<MultiModelGenerationResult> {
  return falAIClient.generateWithMultipleModels(modelKeys, prompt, settings);
}

export async function testModelAvailability(
  modelKey: string
): Promise<boolean> {
  return falAIClient.testModelAvailability(modelKey);
}

export async function estimateGenerationTime(
  modelKeys: string[],
  prompt: string
): Promise<Record<string, number>> {
  return falAIClient.estimateGenerationTime(modelKeys, prompt);
}

// Helper function to batch requests with rate limiting
export async function batchGenerate(
  requests: Array<{
    modelKey: string;
    prompt: string;
    settings: GenerationSettings;
  }>,
  options: {
    concurrency?: number;
    delayBetweenBatches?: number;
  } = {}
): Promise<Array<{ request: (typeof requests)[0]; result: GenerationResult }>> {
  const { concurrency = 3, delayBetweenBatches = 1000 } = options;
  const results: Array<{
    request: (typeof requests)[0];
    result: GenerationResult;
  }> = [];

  // Process requests in batches
  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);

    const batchPromises = batch.map(async (request) => {
      const result = await generateWithModel(
        request.modelKey,
        request.prompt,
        request.settings
      );
      return { request, result };
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((settledResult) => {
      if (settledResult.status === "fulfilled") {
        results.push(settledResult.value);
      } else {
        // Handle rejected batch item
        console.error("Batch generation item failed:", settledResult.reason);
      }
    });

    // Delay between batches to respect rate limits
    if (i + concurrency < requests.length && delayBetweenBatches > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}
