import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException
} from '@nestjs/common'
import { Queue } from 'bullmq'
import 'multer'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateVideoDto } from './dto/create-video.dto'
import { CloudinaryService } from 'src/cloudinary/cloudinary.service'
import dayjs from 'dayjs'
import { VideoStatus } from '@prisma/client'

@Injectable()
export class VideosService {
	private readonly logger = new Logger(VideosService.name)

	constructor(
		private readonly prismaService: PrismaService,
		@InjectQueue('browser') private readonly queue: Queue,
		private readonly cloudinaryService: CloudinaryService
	) {}

	async create(userId: string, file: Express.Multer.File, dto: CreateVideoDto) {
		if (!file) {
			throw new BadRequestException('Видео файл обязателен для загрузки')
		}

		const uploadedFile = await this.cloudinaryService.uploadFile(file)
		if (!uploadedFile?.secure_url || !uploadedFile)
			throw new BadRequestException('Bad uploaded file')

		const safeDescription = dto.description?.trim() || ''
		const scheduledAt = dto.scheduledTime
			? dayjs(dto.scheduledTime).toDate()
			: undefined

		const video = await this.prismaService.video.create({
			data: {
				description: safeDescription,
				scheduledAt,
				userId,
				file: 'https://res.cloudinary.com/dwbzak6xg/video/upload/v1785614496/nestjs_uploads/j3sdrs6pvwbqdhlxjn7f.mp4',
				status: VideoStatus.PEDNGING
			}
		})

		await this.queue.add('uploaded', {
			videoId: video.id
		})

		return video
	}

	async findById(id: string) {
		const video = await this.prismaService.video.findUnique({ where: { id } })
		if (!video) throw new NotFoundException('Video not found')

		return video
	}
}
