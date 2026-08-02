import {
	Body,
	Controller,
	Post,
	UploadedFile,
	UseInterceptors
} from '@nestjs/common'
import { VideosService } from './videos.service'
import { GetAuthUser } from 'src/users/decorators/users.decorator'
import { CreateVideoDto } from './dto/create-video.dto'
import { FileInterceptor } from '@nestjs/platform-express'
import { Auth } from 'src/auth/decorators/auth.decorator'

@Controller('videos')
export class VideosController {
	constructor(private readonly videosService: VideosService) {}

	@Auth()
	@Post()
	@UseInterceptors(FileInterceptor('video'))
	async upload(
		@UploadedFile() file: Express.Multer.File,
		@Body() dto: CreateVideoDto,
		@GetAuthUser('id') userId: string
	) {
		return this.videosService.create(userId, file, dto)
	}
}
