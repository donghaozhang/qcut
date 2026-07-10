export type PersonCutoutWorkerRequest =
	| {
			type: "initialize";
			wasmRoot: string;
			modelUrl: string;
			visionBundleUrl: string;
	  }
	| {
			type: "segment";
			requestId: number;
			frame: ImageBitmap;
			sourceTimestampMs: number;
	  }
	| { type: "reset" }
	| { type: "close" };

export type PersonCutoutWorkerResponse =
	| { type: "ready"; labels: string[] }
	| {
			type: "result";
			requestId: number;
			personConfidence: Float32Array;
			width: number;
			height: number;
			inferenceMs: number;
	  }
	| { type: "error"; requestId?: number; message: string };
