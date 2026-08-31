import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent, Payment, Bounty, User } from '../common/entities';
import { EventReplayService } from './event-replay.service';
import { MaterializedViewsService } from './materialized-views.service';
import { SnapshotReconstructionService } from './snapshot-reconstruction.service';
import { GithubModule } from '../github/github.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent, Payment, Bounty, User]),
    GithubModule,
  ],
  providers: [
    EventReplayService,
    MaterializedViewsService,
    SnapshotReconstructionService,
  ],
  exports: [
    EventReplayService,
    MaterializedViewsService,
    SnapshotReconstructionService,
  ],
})
export class IndexerModule {}