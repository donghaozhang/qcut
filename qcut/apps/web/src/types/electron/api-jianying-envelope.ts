import type { JianyingEnvelopeAPI } from "../../../../../electron/jianying-envelope-key-contract";

export interface ElectronJianyingEnvelopeOps {
	jianyingEnvelope?: JianyingEnvelopeAPI;
}

export type {
	EnvelopeDeleteResultDto,
	EnvelopePurgeResultDto,
	EnvelopeReadResultDto,
	EnvelopeRotateResultDto,
	EnvelopeStatusResultDto,
	EnvelopeStoreResultDto,
	JianyingEnvelopeAPI,
	JianyingEnvelopeErrorDto,
	JianyingEnvelopeResultDto,
} from "../../../../../electron/jianying-envelope-key-contract";
