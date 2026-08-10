import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { BrowserLoginService } from './browser-login.service'
import { BrowserUploadService } from './browser-upload.service'
import { BrowserService } from './browser.service'

@Processor('browser')
export class BrowserProcessor extends WorkerHost {
	constructor(
		private readonly browserLoginService: BrowserLoginService,
		private readonly browserUploadService: BrowserUploadService,
		private readonly browserService: BrowserService
	) {
		super()
	}

	async process(job: Job): Promise<any> {
		if (job.name === 'create-browser')
			return this.browserLoginService.login(job)
		if (job.name === 'uploaded')
			return this.browserUploadService.uploadVideo(job)
		if (job.name === 'logout') return this.browserService.logout(job)
	}
}
