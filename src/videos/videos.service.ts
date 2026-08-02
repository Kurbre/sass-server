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
import { VideoStatus } from '@prisma/client'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezone)

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
		const targetTime = dayjs.tz(
			dto.scheduledTime,
			'DD.MM.YYYY HH:mm',
			'Europe/Kyiv'
		)

		const currentTime = dayjs() // Текущее время
		const delay = targetTime.diff(currentTime)

		console.log(`Запланировано на: ${targetTime.format()}`)
		console.log(`Текущее время сервера: ${currentTime.format()}`)
		console.log(`Delay: ${delay} мс`)

		const video = await this.prismaService.video.create({
			data: {
				description: safeDescription,
				scheduledAt: targetTime.toDate(),
				userId,
				file: uploadedFile.secure_url,
				status: VideoStatus.PEDNGING
			}
		})

		if (delay > 0) {
			await this.queue.add(
				'uploaded',
				{
					videoId: video.id
				},
				{ delay }
			)

			return video
		}

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
