import { Module } from '@nestjs/common'
import { VideosService } from './videos.service'
import { VideosController } from './videos.controller'
import { BullModule } from '@nestjs/bullmq'
import { AccountsModule } from 'src/accounts/accounts.module'

@Module({
	controllers: [VideosController],
	providers: [VideosService],
	imports: [
		BullModule.registerQueue({
			name: 'tiktok'
		}),
		AccountsModule
	],
	exports: [VideosService]
})
export class VideosModule {}
