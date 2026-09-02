import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Account, Video, VideoStatus } from '@prisma/client'
import { BrowserContext, chromium } from 'patchright'
import { TiktokService } from 'src/tiktok/tiktok.service'
import { EventsGateway } from 'src/events/events.gateway'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class CronTasksService {
	private readonly logger = new Logger(CronTasksService.name)
	private isAccountChecking = false
	private isVideoChecking = false

	constructor(
		private readonly prismaService: PrismaService,
		private readonly tiktokService: TiktokService,
		private readonly eventsGateway: EventsGateway
	) {}

	// @Cron(CronExpression.EVERY_30_MINUTES)
	async checkAccountSessions() {
		if (this.isAccountChecking) {
			this.logger.warn('[Cron] Проверка аккаунтов уже выполняется, пропуск...')
			return
		}

		this.isAccountChecking = true
		this.logger.log('[Cron] Старт проверки авторизации аккаунтов...')

		try {
			// Получаем все подключенные аккаунты
			const accounts = await this.prismaService.account.findMany({
				where: { connected: true }
			})

			this.logger.log(
				`[Cron] Найдено подключенных аккаунтов: ${accounts.length}`
			)

			for (const account of accounts) {
				await this.verifySingleAccount(account)
			}
		} catch (error) {
			this.logger.error('[Cron] Ошибка при массовой проверке аккаунтов:', error)
		} finally {
			this.isAccountChecking = false
			this.logger.log('[Cron] Проверка аккаунтов завершена.')
		}
	}

	private async verifySingleAccount(account: Account) {
		let context: BrowserContext | null = null

		try {
			context = await chromium.launchPersistentContext(
				`profiles/${account.id}`,
				{
					headless: true, // В кроне запускаем в фоновом (headless) режиме
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

			const isLoggedIn = await this.tiktokService.isLoggedIn(context)
			console.log(account.profilePath, isLoggedIn)

			if (!isLoggedIn) {
				this.logger.warn(
					`[Cron] Аккаунт ${account.username || account.id} разлогинился!`
				)

				// Помечаем аккаунт как отключенный
				await this.prismaService.account.update({
					where: { id: account.id },
					data: { connected: false }
				})

				// Оповещаем пользователя через сокеты
				this.eventsGateway.emitToUser(account.userId, 'tiktokAuth', {
					message: `Сессия аккаунта @${account.username || ''} истекла. Пожалуйста, залогиньтесь снова.`,
					isLogin: false,
					isError: true,
					accountId: account.id
				})
			} else {
				this.logger.log(
					`[Cron] Аккаунт ${account.username || account.id} активен.`
				)
			}
		} catch (error) {
			this.logger.error(`[Cron] Ошибка проверки аккаунта ${account.id}:`, error)
		} finally {
			if (context) {
				await context.close().catch(() => {})
			}
		}
	}

	// @Cron(CronExpression.EVERY_10_MINUTES)
	async checkVideoStatus() {
		if (this.isVideoChecking) {
			this.logger.warn('[Cron] Проверка видео уже выполняется, пропуск...')
			return
		}

		this.isVideoChecking = true
		this.logger.log('[Cron] Старт проверки опубликованных видео по ссылкам...')

		try {
			const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)

			// Выбираем ТОЛЬКО видео, у которых ЕСТЬ ссылка (not: null) и статус POSTED
			const videos = await this.prismaService.video.findMany({
				where: {
					tiktokVideoUrl: {
						not: null
					},
					status: VideoStatus.POSTED,
					createdAt: {
						lte: fifteenMinutesAgo
					}
				},
				include: {
					account: true
				},
				take: 20
			})

			if (videos.length === 0) {
				this.logger.log('[Cron] Нет видео с ссылками для проверки.')
				return
			}

			this.logger.log(
				`[Cron] Найдено видео с ссылками для проверки: ${videos.length}`
			)

			for (const video of videos) {
				await this.verifySingleVideoLink(video)
			}
		} catch (error) {
			this.logger.error('[Cron] Ошибка проверки видео по ссылкам:', error)
		} finally {
			this.isVideoChecking = false
			this.logger.log('[Cron] Проверка видео завершена.')
		}
	}

	private async verifySingleVideoLink(video: Video & { account: Account }) {
		if (!video.tiktokVideoUrl) return

		try {
			// Используем публичный oEmbed API TikTok для точной проверки
			const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(video.tiktokVideoUrl)}`

			const response = await fetch(oembedUrl, {
				method: 'GET',
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
				}
			})

			// Если статус НЕ 200 OK (oEmbed возвращает 400 или 404, если видео удалено или скрыто)
			if (!response.ok) {
				this.logger.warn(
					`[Cron] Видео ${video.id} недоступно по oEmbed (HTTP ${response.status}). Помечаем как FAILED.`
				)

				await this.prismaService.video.update({
					where: { id: video.id },
					data: {
						status: VideoStatus.FAILED,
						errorMessage: 'Видео было удалено или недоступно в TikTok'
					}
				})

				this.eventsGateway.emitToUser(video.userId, 'videoStatus', {
					videoId: video.id,
					status: VideoStatus.FAILED,
					message: `Видео по ссылке ${video.tiktokVideoUrl} недоступно или было удалено.`
				})
			} else {
				this.logger.log(
					`[Cron] Видео ${video.id} доступно (подтверждено через oEmbed).`
				)
			}
		} catch (error) {
			this.logger.error(
				`[Cron] Не удалось проверить ссылку видео ${video.id}:`,
				error
			)
		}
	}
}
