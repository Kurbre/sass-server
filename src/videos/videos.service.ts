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
import { AccountsService } from 'src/accounts/accounts.service'
import { UpdateVideoDto } from './dto/update-video.dto'
import { GetVideosQueryDto } from './dto/get-videos-query.dto'

dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class VideosService {
	constructor(
		private readonly prismaService: PrismaService,
		@InjectQueue('tiktok') private readonly queue: Queue,
		private readonly accountsService: AccountsService
	) {}

	async create(userId: string, file: Express.Multer.File, dto: CreateVideoDto) {
		if (!file) {
			throw new BadRequestException('Видео файл обязателен для загрузки')
		}

		const account = await this.accountsService.findById(dto.accountId)

		if (!account.connected)
			throw new BadRequestException(
				'Account disconnected, please reconnect the account.'
			)

		const safeDescription = dto.description?.trim() || ''
		let targetTime: Date | null = null
		let delay = 0

		if (dto.scheduledTime) {
			const parsedScheduledTime = this.parseAndValidateScheduledTime(
				dto.scheduledTime
			)

			delay = parsedScheduledTime.delay
			targetTime = parsedScheduledTime.targetTime
		}

		const isScheduled = delay > 0
		const status = isScheduled ? VideoStatus.SCHEDULED : VideoStatus.PENDING

		const video = await this.prismaService.video.create({
			data: {
				description: safeDescription,
				scheduledAt: targetTime ? targetTime : null,
				userId,
				file: file.path,
				status,
				accountId: dto.accountId
			}
		})

		await this.queue.add(
			'uploaded',
			{ videoId: video.id },
			{
				...(isScheduled ? { delay } : {}),
				jobId: video.id
			}
		)

		return video
	}

	async updateScheduleVideo(
		videoId: string,
		userId: string,
		dto: UpdateVideoDto
	) {
		const video = await this.findById(videoId, userId)

		if (video.status !== VideoStatus.SCHEDULED)
			throw new BadRequestException('No video is scheduled.')

		const isScheduled = !!dto.scheduledTime

		const data: {
			description?: string
			scheduledAt?: Date
			accountId?: string
		} = {}

		if (isScheduled && dto.scheduledTime) {
			const { delay, targetTime } = this.parseAndValidateScheduledTime(
				dto.scheduledTime
			)

			const job = await this.queue.getJob(videoId)

			if (!job) throw new NotFoundException('Scheduled job not found')

			const state = await job.getState()

			if (state !== 'delayed' && state !== 'waiting') {
				throw new BadRequestException('Video publication has already started.')
			}

			await job.remove()

			await this.queue.add(
				'uploaded',
				{ videoId },
				{
					delay,
					jobId: videoId
				}
			)

			data.scheduledAt = targetTime
		}

		if (dto.description) data.description = dto.description
		if (dto.accountId) data.accountId = dto.accountId

		await this.prismaService.video.update({
			where: { id: videoId },
			data
		})

		return video
	}

	async delete(videoId: string, userId: string) {
		const video = await this.findById(videoId, userId)

		if (video.status === VideoStatus.SCHEDULED) {
			const job = await this.queue.getJob(videoId)
			if (job) job.remove()
		}

		await this.queue.add('delete', { videoId })

		return {
			success: true
		}
	}

	async findByUserId(userId: string, params?: GetVideosQueryDto) {
		return this.prismaService.video.findMany({
			where: {
				userId,
				...(params?.status && {
					status: params.status
				})
			},
			include: {
				account: true,
				user: true
			},
			orderBy: params?.sort
				? {
						createdAt: params.sort
					}
				: undefined,
			skip: params?.skip,
			take: params?.take
		})
	}

	async findById(id: string, userId?: string) {
		const video = await this.prismaService.video.findUnique({
			where: { id },
			include: {
				account: true,
				user: true,
				statsHistory: true
			}
		})
		if (!video) throw new NotFoundException('Video not found')

		if (userId)
			if (video.userId !== userId)
				throw new NotAcceptableException('Not access.')

		return video
	}

	async retryUpload(videoId: string, userId: string) {
		await this.findById(videoId, userId)

		await this.prismaService.video.update({
			where: { id: videoId },
			data: {
				status: VideoStatus.PENDING
			}
		})

		await this.queue.add('uploaded', { videoId }, { attempts: 3 })

		return {
			success: true,
			videoId
		}
	}

	async cancelSchedule(videoId: string, userId: string) {
		const video = await this.findById(videoId, userId)

		if (video.status !== VideoStatus.SCHEDULED)
			throw new BadRequestException('Only a scheduled video can be cancelled.')

		const job = await this.queue.getJob(videoId)

		if (job) await job.remove()

		await this.prismaService.video.update({
			where: { id: videoId },
			data: {
				status: VideoStatus.CANCELED
			}
		})

		return {
			success: true
		}
	}

	async dashboard(videoId: string, userId: string) {
		const video = await this.findById(videoId, userId)

		const chart = video.statsHistory.map(
			({ id, createdAt, videoId, ...rest }) => ({
				date: createdAt,
				...rest
			})
		)

		const { comments, views, likes, shares, favorites } = video

		return {
			comments,
			views,
			likes,
			shares,
			favorites,
			chart
		}
	}

	private parseAndValidateScheduledTime(scheduledTime: string): {
		targetTime: Date
		delay: number
	} {
		const targetTime = dayjs.tz(
			scheduledTime,
			'DD.MM.YYYY HH:mm',
			'Europe/Kyiv'
		)

		if (!targetTime.isValid()) {
			throw new BadRequestException(
				'Неверный формат даты. Используйте DD.MM.YYYY HH:mm'
			)
		}

		const currentTime = dayjs().tz('Europe/Kyiv')
		const delay = targetTime.diff(currentTime)

		if (delay <= 0) {
			throw new BadRequestException(
				'The publication time must be in the future.'
			)
		}

		return { targetTime: targetTime.toDate(), delay }
	}

	async getCalendarScheduled(userId: string, from?: string, to?: string) {
		const whereClause: any = {
			userId,
			scheduledAt: { not: null },
			status: VideoStatus.SCHEDULED
		}

		if (from || to) {
			whereClause.scheduledAt = {
				...(from
					? { gte: dayjs.tz(from, 'Europe/Kyiv').startOf('day').toDate() }
					: {}),
				...(to
					? { lte: dayjs.tz(to, 'Europe/Kyiv').endOf('day').toDate() }
					: {})
			}
		}

		const videos = await this.prismaService.video.findMany({
			where: whereClause,
			orderBy: {
				scheduledAt: 'asc'
			}
		})

		const calendar: Record<string, typeof videos> = {}

		for (const video of videos) {
			if (!video.scheduledAt) continue

			const dateKey = dayjs(video.scheduledAt)
				.tz('Europe/Kyiv')
				.format('YYYY-MM-DD')

			if (!calendar[dateKey]) {
				calendar[dateKey] = []
			}

			calendar[dateKey].push(video)
		}

		return calendar
	}

	async getCountVideoAnWeek(userId: string) {
		const startOfWeek = dayjs().tz('Europe/Kyiv').startOf('week')
		const endOfWeek = dayjs().tz('Europe/Kyiv').endOf('week')

		const videos = await this.prismaService.video.findMany({
			where: {
				userId,
				createdAt: {
					gte: startOfWeek.toDate(),
					lte: endOfWeek.toDate()
				}
			},
			select: {
				createdAt: true
			}
		})

		const result = {
			Пн: 0,
			Вт: 0,
			Ср: 0,
			Чт: 0,
			Пт: 0,
			Сб: 0,
			Вс: 0
		}

		const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

		for (const video of videos) {
			const day = dayjs(video.createdAt).tz('Europe/Kyiv').day()

			result[days[day] as keyof typeof result]++
		}

		return result
	}
}
