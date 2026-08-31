import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import type { BackfillOptions } from './event-replay.service';
import type { SnapshotOptions } from './snapshot-reconstruction.service';
import { EventReplayService } from './event-replay.service';
import { MaterializedViewsService } from './materialized-views.service';
import { SnapshotReconstructionService } from './snapshot-reconstruction.service';

@Controller('indexer')
export class IndexerController {
  constructor(
    private readonly replayService: EventReplayService,
    private readonly viewsService: MaterializedViewsService,
    private readonly snapshotService: SnapshotReconstructionService,
  ) {}

  @Post('replay/start')
  async startReplay(@Body() options: BackfillOptions) {
    return this.replayService.startBackfill(options);
  }

  @Get('replay/progress')
  getReplayProgress() {
    return this.replayService.getProgress();
  }

  @Get('replay/stats')
  getEventStats() {
    return this.replayService.getEventStats();
  }

  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit?: string) {
    return this.viewsService.getLeaderboard(limit ? parseInt(limit, 10) : 100);
  }

  @Get('balance/:userId')
  async getUserBalance(@Query('userId') userId: string) {
    return this.viewsService.getUserBalance(userId);
  }

  @Post('views/refresh')
  async refreshViews() {
    await this.viewsService.forceRefresh();
    return { success: true };
  }

  @Post('snapshot/reconstruct')
  async reconstructSnapshot(@Body() options: SnapshotOptions) {
    return this.snapshotService.reconstructBalances(options);
  }
}