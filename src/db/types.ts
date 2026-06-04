import type { Fact, LyricLine } from "@/agents/schemas";
import type {
  JobInputParams,
  JobStatus,
  PipelineCheckpoint,
  SongParams,
  StageName,
  StageStates,
} from "@/shared/types";

/**
 * Firestore document shapes. Timestamps are stored as epoch millis (numbers)
 * so they sort cleanly and serialize directly to client components.
 */

export interface DbProject {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  focusPromptDefault?: string | null;
  createdAt: number;
}

export interface DbSourceDocument {
  id: string;
  projectId: string;
  userId: string;
  kind: "upload" | "paste";
  filename: string;
  mime?: string | null;
  storageKey?: string | null;
  bytes?: number | null;
  status: "stored" | "extracted" | "failed";
  normalizedText?: string | null;
  tokenEstimate?: number | null;
  warnings?: string[];
  createdAt: number;
}

export interface DbKnowledgeMap {
  id: string;
  projectId: string;
  sourceHash: string;
  facts: Fact[];
  themes: string[];
  focusApplied?: string | null;
  createdAt: number;
}

export interface DbGenerationJob {
  id: string;
  projectId: string;
  userId: string;
  status: JobStatus;
  currentStage?: StageName | null;
  stageStates: StageStates;
  inputParams: JobInputParams;
  knowledgeMapId?: string | null;
  musicProviderId?: string | null;
  songId?: string | null;
  error?: string | null;
  checkpoint?: PipelineCheckpoint | null;
  createdAt: number;
  updatedAt: number;
}

export interface DbSong {
  id: string;
  projectId: string;
  userId: string;
  jobId?: string | null;
  title: string;
  description?: string | null;
  lyrics: string;
  lineFactMap?: LyricLine[];
  knowledgeMapId?: string | null;
  params: SongParams;
  providerId?: string | null;
  audioStorageKey?: string | null;
  audioDurationSec?: number | null;
  parentSongId?: string | null;
  rootSongId?: string | null;
  version: number;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DbShare {
  id: string;
  songId: string;
  ownerId: string;
  slug: string;
  visibility: "unlisted" | "public";
  allowDownload: boolean;
  expiresAt?: number | null;
  createdAt: number;
}
