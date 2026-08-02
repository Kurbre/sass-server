import { Module } from '@nestjs/common'
import { BrowserService } from './browser.service'
import { BrowserController } from './browser.controller'
import { BrowserProcessor } from './browser.processor'
import { BullModule } from '@nestjs/bullmq'
import { VideosModule } from 'src/videos/videos.module'

@Module({
	controllers: [BrowserController],
	providers: [BrowserService, BrowserProcessor],
	imports: [VideosModule]
})
export class BrowserModule {}
