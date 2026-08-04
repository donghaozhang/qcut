import type { JianyingDraftImportAPI } from "../../../../../electron/jianying-draft-import-contract";

export interface ElectronJianyingDraftImportOps {
	jianyingDraftImport?: JianyingDraftImportAPI;
}

export type {
	DraftImportCommitDto,
	DraftImportCommitRequestDto,
	DraftImportInspectDto,
	DraftImportInspectRequestDto,
	DraftImportInboxEntryRequestDto,
	DraftImportInboxEntrySummaryDto,
	DraftImportIssueDto,
	DraftImportMediaChunkDto,
	DraftImportMediaChunkRequestDto,
	DraftImportMediaGrantDto,
	DraftImportMediaPayloadDto,
	DraftImportMediaReleaseDto,
	DraftImportMediaReleaseRequestDto,
	DraftImportPlanDto,
	DraftImportPlanRequestDto,
	JianyingDraftImportAPI,
	JianyingDraftImportErrorDto,
	JianyingDraftImportResultDto,
} from "../../../../../electron/jianying-draft-import-contract";
