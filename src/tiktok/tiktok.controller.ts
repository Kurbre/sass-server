import { Controller, Get, Param } from '@nestjs/common'
import { TiktokService } from './tiktok.service'
import { chromium } from 'patchright'

@Controller('tiktok')
export class TiktokController {
	constructor(private readonly tiktokService: TiktokService) {}

	@Get(':id')
	async launchBrowser(@Param('id') id: string) {
		const context = await chromium.launchPersistentContext(`profiles/${id}`, {
			headless: false,
			executablePath: '/usr/bin/google-chrome',
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		})

		const page = await context.newPage()
		await page.goto('https://www.tiktok.com/')
	}
}
