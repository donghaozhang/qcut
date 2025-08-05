"use client";

import React, { useState } from "react";
import { BlobImage } from "@/components/ui/blob-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Image as ImageIcon,
  Download,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useText2ImageStore } from "@/stores/text2image-store";
import { TEXT2IMAGE_MODELS } from "@/lib/text2image-models";
import {
  FloatingActionPanelRoot,
  FloatingActionPanelTrigger,
  FloatingActionPanelContent,
  FloatingActionPanelModelOption,
} from "@/components/ui/floating-action-panel";

// Debug flag - set to false to disable console logs
const DEBUG_TEXT2IMAGE = process.env.NODE_ENV === "development" && false;

export function Text2ImageView() {
  if (DEBUG_TEXT2IMAGE) console.log("Text2ImageView rendered");

  const {
    prompt,
    setPrompt,
    selectedModels,
    toggleModel,
    generationMode,
    setGenerationMode,
    isGenerating,
    generateImages,
    generationResults,
    selectedResults,
    toggleResultSelection,
    addSelectedToMedia,
    clearResults,
  } = useText2ImageStore();

  if (DEBUG_TEXT2IMAGE) {
    console.log("Text2ImageView store state:", {
      prompt,
      selectedModels,
      generationMode,
      isGenerating,
      hasResults: Object.keys(generationResults).length > 0,
    });

    console.log("Available models:", Object.keys(TEXT2IMAGE_MODELS));
  }

  const [imageSize, setImageSize] = useState("square_hd");
  const [seed, setSeed] = useState("");

  const selectedModelCount = selectedModels.length;
  const hasResults = Object.keys(generationResults).length > 0;
  const selectedResultCount = selectedResults.length;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      if (DEBUG_TEXT2IMAGE) console.log("No prompt provided");
      return;
    }

    if (DEBUG_TEXT2IMAGE) {
      console.log("Starting generation with:", {
        prompt,
        selectedModels,
        imageSize,
        seed,
      });
    }

    const settings = {
      imageSize,
      seed: seed ? parseInt(seed) : undefined,
    };

    try {
      await generateImages(prompt, settings);
      console.log("Generation completed");
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleAddToMedia = () => {
    addSelectedToMedia();
    clearResults();
  };

  return (
    <div className="p-4 space-y-6">
      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={!prompt.trim() || selectedModelCount === 0 || isGenerating}
        className="w-full"
        size="lg"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4 mr-2" />
            {generationMode === "single"
              ? "Generate Image"
              : `Generate with ${selectedModelCount} Model${selectedModelCount !== 1 ? "s" : ""}`}
          </>
        )}
      </Button>

      {/* Mode Selection */}
      <Card className="border-0 shadow-none" style={{ marginTop: "5px" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Generation Mode</CardTitle>
          <div style={{ height: "6px" }} />
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={generationMode}
            onValueChange={(value: "single" | "multi") =>
              setGenerationMode(value)
            }
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center space-x-2 cursor-pointer">
              <RadioGroupItem value="single" id="single" className="h-3 w-3" />
              <Label htmlFor="single" className="text-xs cursor-pointer">
                Single Model
              </Label>
            </div>
            <div className="flex items-center space-x-2 cursor-pointer">
              <RadioGroupItem value="multi" id="multi" className="h-3 w-3" />
              <Label htmlFor="multi" className="text-xs cursor-pointer">
                Multi-Model Compare
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card className="border-0 shadow-none">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm">
            {generationMode === "single"
              ? "Select Model"
              : `Select Models (${selectedModelCount} chosen)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <FloatingActionPanelRoot defaultMode="selection">
            {({ mode, open }) => (
              <div>
                <FloatingActionPanelTrigger
                  mode="selection"
                  title="Click to select AI models"
                  className="w-full !bg-transparent hover:!bg-transparent border border-input h-8 text-xs"
                >
                  {selectedModelCount === 0
                    ? "Click to choose"
                    : generationMode === "single" && selectedModels[0]
                      ? TEXT2IMAGE_MODELS[selectedModels[0]]?.name
                      : "Click to change selection"}
                </FloatingActionPanelTrigger>

                {open && (
                  <div className="w-full border rounded-md bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm max-h-[250px] overflow-y-auto shadow-md mt-1">
                    <div className="p-2 space-y-1">
                      {Object.entries(TEXT2IMAGE_MODELS).map(([key, model]) => (
                        <FloatingActionPanelModelOption
                          key={key}
                          id={key}
                          name={model.name}
                          checked={selectedModels.includes(key)}
                          onCheckedChange={(checked) => {
                            if (generationMode === "single") {
                              // Clear all selections and select only this one
                              selectedModels.forEach((m) => {
                                if (m !== key) toggleModel(m);
                              });
                              if (checked && !selectedModels.includes(key)) {
                                toggleModel(key);
                              }
                            } else {
                              // Multi-model mode - just toggle
                              toggleModel(key);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </FloatingActionPanelRoot>
        </CardContent>
      </Card>

      {/* Prompt Input */}
      <Card className="border-0 shadow-none" style={{ marginTop: "5px" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Prompt</CardTitle>
          <div style={{ height: "5px" }} />
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Describe the image you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[100px] resize-none"
          />
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="border-0 shadow-none" style={{ marginTop: "5px" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm" style={{ marginLeft: "5px" }}>
            Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="size" className="text-xs">
                Image Size
              </Label>
              <div style={{ height: "5px" }} />
              <Select value={imageSize} onValueChange={setImageSize}>
                <SelectTrigger
                  id="size"
                  className="justify-between text-zinc-900 dark:text-zinc-100"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999] bg-white dark:bg-zinc-800 border shadow-lg">
                  <SelectItem
                    value="square"
                    className="text-zinc-900 dark:text-zinc-100"
                  >
                    Square
                  </SelectItem>
                  <SelectItem
                    value="square_hd"
                    className="text-zinc-900 dark:text-zinc-100"
                  >
                    Square HD
                  </SelectItem>
                  <SelectItem
                    value="landscape_4_3"
                    className="text-zinc-900 dark:text-zinc-100"
                  >
                    Landscape (4:3)
                  </SelectItem>
                  <SelectItem
                    value="landscape_16_9"
                    className="text-zinc-900 dark:text-zinc-100"
                  >
                    Landscape (16:9)
                  </SelectItem>
                  <SelectItem
                    value="portrait_4_3"
                    className="text-zinc-900 dark:text-zinc-100"
                  >
                    Portrait (4:3)
                  </SelectItem>
                  <SelectItem
                    value="portrait_16_9"
                    className="text-zinc-900 dark:text-zinc-100"
                  >
                    Portrait (16:9)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="seed" className="text-xs">
                Seed (Optional)
              </Label>
              <Input
                id="seed"
                placeholder="Random"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                type="number"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasResults && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {generationMode === "single"
                  ? "Generated Image"
                  : "Compare Results"}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={clearResults}
                className="text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {generationMode === "single" ? (
              // Single result
              <div className="space-y-4">
                {Object.entries(generationResults).map(([modelKey, result]) => (
                  <div key={modelKey} className="space-y-2">
                    {result.status === "loading" && (
                      <div className="flex items-center justify-center p-8 border-2 border-dashed rounded-lg">
                        <div className="text-center">
                          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                          <p className="text-sm text-muted-foreground">
                            Generating with {TEXT2IMAGE_MODELS[modelKey]?.name}
                            ...
                          </p>
                        </div>
                      </div>
                    )}
                    {result.status === "success" && result.imageUrl && (
                      <div className="space-y-2">
                        <BlobImage
                          src={result.imageUrl}
                          alt="Generated artwork"
                          className="w-full rounded-lg border"
                          crossOrigin="anonymous"
                        />
                        <Button
                          onClick={() =>
                            addSelectedToMedia([
                              {
                                modelKey,
                                imageUrl: result.imageUrl!,
                                prompt,
                                settings: {
                                  imageSize,
                                  seed: seed ? parseInt(seed) : undefined,
                                },
                              },
                            ])
                          }
                          className="w-full"
                          variant="outline"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Add to Media Panel
                        </Button>
                      </div>
                    )}
                    {result.status === "error" && (
                      <div className="p-4 border-2 border-red-200 rounded-lg bg-red-50">
                        <p className="text-sm text-red-800">
                          Failed to generate with{" "}
                          {TEXT2IMAGE_MODELS[modelKey]?.name}: {result.error}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Multi-model comparison
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(generationResults).map(
                    ([modelKey, result]) => (
                      <div
                        key={modelKey}
                        className="border rounded-lg overflow-hidden"
                      >
                        <div className="p-3 bg-muted">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">
                              {TEXT2IMAGE_MODELS[modelKey]?.name}
                            </h4>
                            {result.status === "success" && result.imageUrl && (
                              <Checkbox
                                checked={selectedResults.some(
                                  (r) => r.modelKey === modelKey
                                )}
                                onCheckedChange={() =>
                                  toggleResultSelection({
                                    modelKey,
                                    imageUrl: result.imageUrl!,
                                    prompt,
                                    settings: {
                                      imageSize,
                                      seed: seed ? parseInt(seed) : undefined,
                                    },
                                  })
                                }
                              />
                            )}
                          </div>
                        </div>
                        <div className="aspect-square bg-muted">
                          {result.status === "loading" && (
                            <div className="flex items-center justify-center h-full">
                              <div className="text-center">
                                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                                <p className="text-xs text-muted-foreground">
                                  Generating...
                                </p>
                              </div>
                            </div>
                          )}
                          {result.status === "success" && result.imageUrl && (
                            <BlobImage
                              src={result.imageUrl}
                              alt={`Generated by ${TEXT2IMAGE_MODELS[modelKey]?.name}`}
                              className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              crossOrigin="anonymous"
                              onClick={() =>
                                toggleResultSelection({
                                  modelKey,
                                  imageUrl: result.imageUrl!,
                                  prompt,
                                  settings: {
                                    imageSize,
                                    seed: seed ? parseInt(seed) : undefined,
                                  },
                                })
                              }
                            />
                          )}
                          {result.status === "error" && (
                            <div className="flex items-center justify-center h-full p-4">
                              <p className="text-xs text-red-600 text-center">
                                Generation failed: {result.error}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>

                {selectedResultCount > 0 && (
                  <Button
                    onClick={handleAddToMedia}
                    className="w-full"
                    size="lg"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Add {selectedResultCount} Selected Image
                    {selectedResultCount !== 1 ? "s" : ""} to Media Panel
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
