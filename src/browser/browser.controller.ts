import { Controller, Get, Param } from '@nestjs/common'
import { BrowserService } from './browser.service'

@Controller('browser')
export class BrowserController {
	constructor(private readonly browserService: BrowserService) {}

	@Get(':id')
	getTiktokId(@Param('id') id: string) {
		return this.browserService.getTikTokId(id)
	}
}
