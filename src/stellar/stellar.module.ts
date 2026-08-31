import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FeeStrategyService } from './fee-strategy.service';

@Module({
  imports: [ConfigModule],
  providers: [FeeStrategyService],
  exports: [FeeStrategyService],
})
export class StellarModule {}