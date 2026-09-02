import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { TiktokStatsService } from './tiktok-stats.service'

@Processor('tiktok-stats', {
	concurrency: 2
})
export class TiktokStatsProcessor extends WorkerHost {
	constructor(private readonly tiktokStatsService: TiktokStatsService) {
		super()
	}

	async process(job: Job): Promise<any> {
		if (job.name === 'get-metrics')
			return this.tiktokStatsService.getAccountMetrics(job)
	}
}
