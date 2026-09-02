import { Module } from '@nestjs/common'
import { TiktokService } from './tiktok.service'
import { TiktokController } from './tiktok.controller'
import { TiktokProcessor } from './tiktok.processor'
import { BullModule } from '@nestjs/bullmq'
import { VideosModule } from 'src/videos/videos.module'
import { AccountsModule } from 'src/accounts/accounts.module'
import { TiktokLoginService } from './tiktok-login.service'
import { TiktokUploadService } from './tiktok-upload.service'
import { TiktokDeleteService } from './tiktok-delete.service'
import { NotificationsModule } from 'src/notifications/notifications.module'

@Module({
	controllers: [TiktokController],
	providers: [
		TiktokService,
		TiktokProcessor,
		TiktokLoginService,
		TiktokUploadService,
		TiktokDeleteService
	],
	imports: [VideosModule, AccountsModule, NotificationsModule],
	exports: [TiktokService]
})
export class TiktokModule {}
