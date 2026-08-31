import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull, Not } from 'typeorm';
import { WebhookEvent } from '../common/entities';
import { WebhookEventStatus } from '../common/enums';
import { GithubWebhooksService } from '../github/github-webhooks.service';

export interface ReplayProgress {
  totalEvents: number;
  processedEvents: number;
  failedEvents: number;
  startedAt: Date;
  lastProcessedAt: Date | null;
  percentComplete: number;
  estimatedTimeRemaining: number | null;
  isComplete: boolean;
  resumeToken: string | null;
}

export interface BackfillOptions {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: string[];
  resumeToken?: string;
  batchSize?: number;
  skipFailures?: boolean;
}

@Injectable()
export class EventReplayService {
  private readonly logger = new Logger(EventReplayService.name);
  private activeReplay: ReplayProgress | null = null;

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepo: Repository<WebhookEvent>,
    private readonly githubWebhooksService: GithubWebhooksService,
  ) {}

  /**
   * Start a backfill/replay operation from a given date range
   */
  async startBackfill(options: BackfillOptions = {}): Promise<ReplayProgress> {
    if (this.activeReplay && !this.activeReplay.isComplete) {
      throw new Error('A replay operation is already in progress');
    }

    const {
      startDate = new Date(0),
      endDate = new Date(),
      eventTypes,
      resumeToken,
      batchSize = 100,
      skipFailures = false,
    } = options;

    this.logger.log(
      `Starting backfill from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // Build query
    const queryBuilder = this.webhookEventRepo
      .createQueryBuilder('event')
      .where('event.receivedAt >= :startDate', { startDate })
      .andWhere('event.receivedAt <= :endDate', { endDate })
      .andWhere('event.signatureValid = :valid', { valid: true });

    if (eventTypes && eventTypes.length > 0) {
      queryBuilder.andWhere('event.eventType IN (:...types)', { types: eventTypes });
    }

    if (resumeToken) {
      queryBuilder.andWhere('event.id > :resumeToken', { resumeToken });
    }

    queryBuilder.orderBy('event.receivedAt', 'ASC');

    const totalEvents = await queryBuilder.getCount();

    this.activeReplay = {
      totalEvents,
      processedEvents: 0,
      failedEvents: 0,
      startedAt: new Date(),
      lastProcessedAt: null,
      percentComplete: 0,
      estimatedTimeRemaining: null,
      isComplete: false,
      resumeToken: null,
    };

    // Process in batches
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const events = await queryBuilder
        .skip(offset)
        .take(batchSize)
        .getMany();

      if (events.length === 0) {
        hasMore = false;
        break;
      }

      for (const event of events) {
        try {
          // Re-process event idempotently
          await this.reprocessEvent(event);
          this.activeReplay.processedEvents++;
          this.activeReplay.lastProcessedAt = new Date();
          this.activeReplay.resumeToken = event.id;
        } catch (error) {
          this.logger.error(
            `Failed to reprocess event ${event.id}: ${error.message}`
          );
          this.activeReplay.failedEvents++;
          
          if (!skipFailures) {
            throw error;
          }
        }

        // Update progress
        this.updateProgress();
      }

      offset += batchSize;
      
      // Log progress
      this.logger.log(
        `Progress: ${this.activeReplay.percentComplete.toFixed(1)}% ` +
        `(${this.activeReplay.processedEvents}/${this.activeReplay.totalEvents})`
      );
    }

    this.activeReplay.isComplete = true;
    this.activeReplay.percentComplete = 100;

    this.logger.log(
      `Backfill complete: ${this.activeReplay.processedEvents} processed, ` +
      `${this.activeReplay.failedEvents} failed`
    );

    return { ...this.activeReplay };
  }

  /**
   * Reprocess a single event idempotently
   */
  private async reprocessEvent(event: WebhookEvent): Promise<void> {
    // Mark as received again for reprocessing
    const originalStatus = event.status;
    event.status = WebhookEventStatus.RECEIVED;
    event.error = null;
    
    await this.webhookEventRepo.save(event);

    try {
      // Re-run the webhook handler
      await this.githubWebhooksService.handleEvent(
        event.eventType,
        event.deliveryId ?? undefined,
        event.payload,
        true // signature already validated
      );
    } catch (error) {
      // Restore original status if reprocessing fails
      event.status = originalStatus;
      event.error = error.message;
      await this.webhookEventRepo.save(event);
      throw error;
    }
  }

  /**
   * Get current replay progress
   */
  getProgress(): ReplayProgress | null {
    return this.activeReplay ? { ...this.activeReplay } : null;
  }

  /**
   * Update progress calculations
   */
  private updateProgress(): void {
    if (!this.activeReplay) return;

    this.activeReplay.percentComplete =
      (this.activeReplay.processedEvents / this.activeReplay.totalEvents) * 100;

    // Estimate time remaining
    if (this.activeReplay.processedEvents > 0 && this.activeReplay.lastProcessedAt) {
      const elapsedMs =
        this.activeReplay.lastProcessedAt.getTime() - this.activeReplay.startedAt.getTime();
      const msPerEvent = elapsedMs / this.activeReplay.processedEvents;
      const remainingEvents =
        this.activeReplay.totalEvents - this.activeReplay.processedEvents;
      this.activeReplay.estimatedTimeRemaining = Math.ceil(
        (remainingEvents * msPerEvent) / 1000
      );
    }
  }

  /**
   * Cancel active replay operation
   */
  cancelReplay(): void {
    if (this.activeReplay) {
      this.logger.warn('Cancelling active replay operation');
      this.activeReplay.isComplete = true;
    }
  }

  /**
   * Get statistics about stored events
   */
  async getEventStats(): Promise<{
    totalEvents: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    oldestEvent: Date | null;
    newestEvent: Date | null;
  }> {
    const totalEvents = await this.webhookEventRepo.count();

    const byType = await this.webhookEventRepo
      .createQueryBuilder('event')
      .select('event.eventType', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.eventType')
      .getRawMany();

    const byStatus = await this.webhookEventRepo
      .createQueryBuilder('event')
      .select('event.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.status')
      .getRawMany();

    const oldest = await this.webhookEventRepo.findOne({
      order: { receivedAt: 'ASC' },
    });

    const newest = await this.webhookEventRepo.findOne({
      order: { receivedAt: 'DESC' },
    });

    return {
      totalEvents,
      byType: byType.reduce((acc, row) => {
        acc[row.type] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>),
      byStatus: byStatus.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>),
      oldestEvent: oldest?.receivedAt ?? null,
      newestEvent: newest?.receivedAt ?? null,
    };
  }
}