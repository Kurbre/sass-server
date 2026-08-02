import { Module } from '@nestjs/common'
import { VideosService } from './videos.service'
import { VideosController } from './videos.controller'
import { BullModule } from '@nestjs/bullmq'

@Module({
	controllers: [VideosController],
	providers: [VideosService],
	imports: [
		BullModule.registerQueue({
			name: 'browser'
		})
	],
	exports: [VideosService]
})
export class VideosModule {}
