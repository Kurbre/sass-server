import {
	Body,
	Controller,
	Delete,
	FileTypeValidator,
	Get,
	MaxFileSizeValidator,
	Param,
	ParseFilePipe,
	Post,
	UploadedFile,
	UseInterceptors
} from '@nestjs/common'
import { VideosService } from './videos.service'
import { GetAuthUser } from 'src/users/decorators/users.decorator'
import { CreateVideoDto } from './dto/create-video.dto'
import { FileInterceptor } from '@nestjs/platform-express'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { diskStorage } from 'multer'
import { extname } from 'path'
import * as fs from 'fs'

const uploadDir = './tmp'
if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir)
}

@Controller('videos')
export class VideosController {
	constructor(private readonly videosService: VideosService) {}

	@Get('me')
	@Auth()
	findByUserId(@GetAuthUser('id') userId: string) {
		return this.videosService.findByUserId(userId)
	}

	@Get(':id')
	@Auth()
	findById(@GetAuthUser('id') userId: string, @Param('id') id: string) {
		return this.videosService.findById(id, userId)
	}

	@Auth()
	@Post()
	@UseInterceptors(
		FileInterceptor('video', {
			// Настраиваем сохранение прямо на жесткий диск
			storage: diskStorage({
				destination: uploadDir, // Папка (создайте ее в корне проекта)
				filename: (req, file, cb) => {
					// Генерируем уникальное имя файла: 1698765432-12345.mp4
					const uniqueSuffix =
						Date.now() + '-' + Math.round(Math.random() * 1e9)
					cb(null, `${uniqueSuffix}${extname(file.originalname)}`)
				}
			})
		})
	)
	async upload(
		@UploadedFile()
		file: Express.Multer.File,
		@Body() dto: CreateVideoDto,
		@GetAuthUser('id') userId: string
	) {
		return this.videosService.create(userId, file, dto)
	}

	@Delete(':id')
	@Auth()
	delete(@Param('id') videoId: string, @GetAuthUser('id') userId: string) {
		return this.videosService.delete(videoId, userId)
	}

	@Post(':id/cancel-schedule')
	@Auth()
	cancelSchedule(@Param('id') id: string, @GetAuthUser('id') userId: string) {
		return this.videosService.cancelSchedule(id, userId)
	}

	@Post(':id/retry')
	@Auth()
	retryUpload(@Param('id') id: string, @GetAuthUser('id') userId: string) {
		return this.videosService.retryUpload(id, userId)
	}

	@Auth()
	@Get(':id/dashboard')
	dashboard(@Param('id') id: string, @GetAuthUser('id') userId: string) {
		return this.videosService.dashboard(id, userId)
	}
}
