import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AccountsModule } from 'src/accounts/accounts.module'
import { TiktokStatsController } from './tiktok-stats.controller'
import { TiktokStatsService } from './tiktok-stats.service'
import { TiktokStatsProcessor } from './tiktok-stats.processor'
import { VideosModule } from 'src/videos/videos.module'

@Module({
	controllers: [TiktokStatsController],
	providers: [TiktokStatsService, TiktokStatsProcessor],
	imports: [
		AccountsModule,
		BullModule.registerQueue({
			name: 'tiktok-stats'
		}),
		VideosModule
	]
})
export class TiktokStatsModule {}
