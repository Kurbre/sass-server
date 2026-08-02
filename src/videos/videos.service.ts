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
import dayjs from 'dayjs'
import { VideoStatus } from '@prisma/client'
import * as fs from 'fs'

@Injectable()
export class VideosService {
	private readonly logger = new Logger(VideosService.name)

	constructor(
		private readonly prismaService: PrismaService,
		@InjectQueue('browser') private readonly queue: Queue
	) {}

	async create(userId: string, file: Express.Multer.File, dto: CreateVideoDto) {
		if (!file) {
			throw new BadRequestException('Видео файл обязателен для загрузки')
		}

		const safeDescription = dto.description?.trim() || ''
		const scheduledAt = dto.scheduledTime
			? dayjs(dto.scheduledTime).toDate()
			: undefined

		const video = await this.prismaService.video.create({
			data: {
				description: safeDescription,
				scheduledAt,
				userId,
				file: file.path,
				status: VideoStatus.PEDNING
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
