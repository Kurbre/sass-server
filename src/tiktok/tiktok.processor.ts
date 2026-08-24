import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { TiktokLoginService } from './tiktok-login.service'
import { TiktokUploadService } from './tiktok-upload.service'
import { TiktokService } from './tiktok.service'

@Processor('tiktok')
export class TiktokProcessor extends WorkerHost {
	constructor(
		private readonly tiktokLoginService: TiktokLoginService,
		private readonly tiktokUploadService: TiktokUploadService,
		private readonly tiktokService: TiktokService
	) {
		super()
	}

	async process(job: Job): Promise<any> {
		if (job.name === 'login') return this.tiktokLoginService.login(job)
		if (job.name === 'uploaded')
			return this.tiktokUploadService.uploadVideo(job)
		if (job.name === 'logout') return this.tiktokService.logout(job)
	}
}
