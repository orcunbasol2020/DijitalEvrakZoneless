export type PipelineStepStatus = 'completed' | 'processing' | 'error' | 'pending';

export type PipelineStepKey = 'tarama' | 'ocr' | 'kayit' | 'atlas';

export interface PipelineStep {
  status: PipelineStepStatus;
  date?: string;
  note?: string;
}

export interface DigitizationTrackingModel {
  id: number;
  documentName: string;
  documentType: string;
  pageCount: number;
  atlasReferenceNo?: string;
  steps: Record<PipelineStepKey, PipelineStep>;
}
