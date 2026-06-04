/** Thrown by the pipeline for unrecoverable failures (no retry). */
export class FatalPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalPipelineError";
  }
}
