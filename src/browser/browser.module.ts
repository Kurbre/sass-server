import { Module } from '@nestjs/common'
import { BrowserService } from './browser.service'
import { BrowserController } from './browser.controller'
import { BrowserProcessor } from './browser.processor'
import { BullModule } from '@nestjs/bullmq'
import { VideosModule } from 'src/videos/videos.module'
import { AccountsModule } from 'src/accounts/accounts.module'
import { BrowserLoginService } from './browser-login.service'
import { BrowserUploadService } from './browser-upload.service'

@Module({
	controllers: [BrowserController],
	providers: [
		BrowserService,
		BrowserProcessor,
		BrowserLoginService,
		BrowserUploadService
	],
	imports: [VideosModule, AccountsModule],
	exports: [BrowserService]
})
export class BrowserModule {}
