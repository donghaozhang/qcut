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
	DraftImportMediaPayloadDto,
	DraftImportPlanDto,
	DraftImportPlanRequestDto,
	JianyingDraftImportAPI,
	JianyingDraftImportErrorDto,
	JianyingDraftImportResultDto,
} from "../../../../../electron/jianying-draft-import-contract";
