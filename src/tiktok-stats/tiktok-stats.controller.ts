import { Controller, Get } from '@nestjs/common'
import { TiktokStatsService } from './tiktok-stats.service'

@Controller('tiktok-stats')
export class TiktokStatsController {
	constructor(private readonly tiktokStatsService: TiktokStatsService) {}

	@Get()
	asdsd() {
		return this.tiktokStatsService.startAccountMetrics()
	}

	@Get('video')
	asdsd12() {
		return this.tiktokStatsService.startVideoMetrics()
	}
}
