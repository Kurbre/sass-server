import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
	Injectable,
	Logger,
	NotAcceptableException,
	NotFoundException
} from '@nestjs/common'
import { Queue } from 'bullmq'
import 'multer'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateVideoDto } from './dto/create-video.dto'
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
		@InjectQueue('tiktok') private readonly queue: Queue
	) {}

	async create(userId: string, file: Express.Multer.File, dto: CreateVideoDto) {
		if (!file) {
			throw new BadRequestException('Видео файл обязателен для загрузки')
		}

		const safeDescription = dto.description?.trim() || ''
		let targetTime: dayjs.Dayjs | null = null
		let delay = 0

		if (dto.scheduledTime) {
			targetTime = dayjs.tz(
				dto.scheduledTime,
				'DD.MM.YYYY HH:mm',
				'Europe/Kyiv'
			)

			if (!targetTime.isValid()) {
				throw new BadRequestException(
					'Неверный формат даты. Используйте DD.MM.YYYY HH:mm'
				)
			}

			const currentTime = dayjs().tz('Europe/Kyiv')
			delay = targetTime.diff(currentTime)
		}

		const isScheduled = delay > 0
		const status = isScheduled ? VideoStatus.SCHEDULED : VideoStatus.PENDING

		const video = await this.prismaService.video.create({
			data: {
				description: safeDescription,
				scheduledAt: targetTime ? targetTime.toDate() : null,
				userId,
				file: file.path,
				status,
				accountId: dto.accountId
			}
		})

		await this.queue.add(
			'uploaded',
			{ videoId: video.id },
			isScheduled ? { delay } : undefined
		)

		return video
	}

	async delete(videoId: string, userId: string) {
		const video = await this.findById(videoId)

		if (video.userId !== userId) throw new NotAcceptableException('Not access.')

		await this.queue.add('delete', { videoId })

		return {
			success: true
		}
	}

	async findByUserId(userId: string) {
		return this.prismaService.video.findMany({
			where: {
				userId
			},
			include: {
				account: true,
				user: true
			}
		})
	}

	async findById(id: string) {
		const video = await this.prismaService.video.findUnique({
			where: { id },
			include: {
				account: true,
				user: true
			}
		})
		if (!video) throw new NotFoundException('Video not found')

		return video
	}
}
