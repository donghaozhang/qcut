export interface Text2ImageModel {
	id: string;
	name: string;
	description: string;
	provider: string;
	endpoint: string;

	/**
	 * Submit via FAL's queue endpoint (`queue.fal.run/...`) instead of the
	 * synchronous `fal.run/...` endpoint. Required for models whose generation
	 * time regularly exceeds ~90 s — the license-server proxy (a Cloudflare
	 * Worker) is fronted by a ~100 s edge timeout, and sync calls to slow
	 * models 504 before FAL finishes. Queue submits return a `request_id` in
	 * ~2 s; the client polls `/api/ai/status` until COMPLETED, then fetches
	 * `/api/ai/result`. Each proxy call stays well under the edge cap.
	 *
	 * Leave unset (or false) for fast models (<30 s typical).
	 */
	useQueue?: boolean;

	// Quality indicators (1-5 scale)
	qualityRating: number;
	speedRating: number;

	// Cost information
	estimatedCost: string;
	costPerImage: number; // in credits/cents

	// Technical specifications
	maxResolution: string;
	supportedAspectRatios: string[];

	// Model-specific parameters
	defaultParams: Record<string, string | number | boolean>;
	availableParams: Array<{
		name: string;
		type: "number" | "string" | "boolean" | "select";
		min?: number;
		max?: number;
		options?: string[];
		default: string | number | boolean | null;
		description: string;
	}>;

	// Use case recommendations
	bestFor: string[];
	strengths: string[];
	limitations: string[];
}
