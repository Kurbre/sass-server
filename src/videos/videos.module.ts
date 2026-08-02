import { Module } from '@nestjs/common'
import { VideosService } from './videos.service'
import { VideosController } from './videos.controller'
import { BullModule } from '@nestjs/bullmq'
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module'

@Module({
	controllers: [VideosController],
	providers: [VideosService],
	imports: [
		BullModule.registerQueue({
			name: 'browser'
		}),
		CloudinaryModule
	],
	exports: [VideosService]
})
export class VideosModule {}
