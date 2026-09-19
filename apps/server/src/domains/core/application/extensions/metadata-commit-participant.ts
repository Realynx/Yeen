import { Injectable } from '@nestjs/common';

export const METADATA_COMMIT_PARTICIPANTS = Symbol.for(
  'com.yeen.addons.metadata-commit-participants.v1',
);

export interface MetadataCommitPlanContract {
  changes: Array<{
    mediaId: string;
    currentPath: string;
    targetPath: string;
    willMove: boolean;
    sidecars: Array<{ from: string; to: string }>;
  }>;
}

export interface MetadataCommitResultContract {
  commitId: string;
  changes: Array<{
    mediaId: string;
    from: string;
    to: string;
    error?: string;
  }>;
}

export interface MetadataCommitParticipantTransaction {
  complete(result: MetadataCommitResultContract): Promise<void>;
  abort(error: unknown): Promise<void>;
}

export interface MetadataCommitParticipant {
  readonly participantId: string;
  prepare(
    plan: MetadataCommitPlanContract,
  ): Promise<MetadataCommitParticipantTransaction | null>;
}

export interface PreparedMetadataCommitParticipant {
  participantId: string;
  transaction: MetadataCommitParticipantTransaction;
}

@Injectable()
export class MetadataCommitParticipantRegistry {
  private readonly participants = new Map<string, MetadataCommitParticipant>();

  register(participant: MetadataCommitParticipant): () => void {
    if (this.participants.has(participant.participantId)) {
      throw new Error(
        `Metadata commit participant already registered: ${participant.participantId}`,
      );
    }
    this.participants.set(participant.participantId, participant);
    return () => {
      if (this.participants.get(participant.participantId) === participant) {
        this.participants.delete(participant.participantId);
      }
    };
  }

  async prepare(
    plan: MetadataCommitPlanContract,
  ): Promise<PreparedMetadataCommitParticipant[]> {
    const prepared: PreparedMetadataCommitParticipant[] = [];
    try {
      for (const participant of this.participants.values()) {
        const transaction = await participant.prepare(plan);
        if (transaction) {
          prepared.push({
            participantId: participant.participantId,
            transaction,
          });
        }
      }
      return prepared;
    } catch (error) {
      await this.abort(prepared, error);
      throw error;
    }
  }

  async complete(
    prepared: readonly PreparedMetadataCommitParticipant[],
    result: MetadataCommitResultContract,
  ): Promise<string[]> {
    const warnings: string[] = [];
    for (const entry of [...prepared].reverse()) {
      try {
        await entry.transaction.complete(result);
      } catch (error) {
        warnings.push(`${entry.participantId}: ${this.toErrorMessage(error)}`);
      }
    }
    return warnings;
  }

  async abort(
    prepared: readonly PreparedMetadataCommitParticipant[],
    error: unknown,
  ): Promise<void> {
    await Promise.allSettled(
      [...prepared].reverse().map((entry) => entry.transaction.abort(error)),
    );
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
