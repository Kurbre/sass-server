import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { VideoStatus } from '@prisma/client'
import { Job, Queue } from 'bullmq'
import { existsSync, unlinkSync } from 'fs'
import { BrowserContext, chromium } from 'patchright'
import { resolve } from 'path'
import { EventsGateway } from 'src/events/events.gateway'
import { PrismaService } from 'src/prisma/prisma.service'
import { VideosService } from 'src/videos/videos.service'

@Injectable()
export class TiktokUploadService {
	private logger = new Logger(TiktokUploadService.name)

	constructor(
		private readonly prismaService: PrismaService,
		private readonly videosService: VideosService,
		private readonly eventsGateway: EventsGateway,
		@InjectQueue('tiktok') private readonly queue: Queue
	) {}

	async uploadVideo(job: Job<{ videoId: string }>) {
		const { videoId } = job.data

		let context
		let filePath: string | null = null
		let tiktokVideoUrl: string | null = null

		try {
			const video = await this.prismaService.video.findUnique({
				where: {
					id: videoId
				},
				include: {
					account: true
				}
			})

			if (!video) {
				this.logger.warn(
					`[Upload] Видео ${videoId} не найдено в БД. Задача отменена.`
				)
				return
			}

			filePath = resolve(video.file)

			this.logger.log(`[Upload] Начало загрузки видео ${videoId}`)

			// 1. Скачиваем видео во временный файл
			if (!existsSync(filePath)) {
				throw new BadRequestException(`Файл не найден на сервере: ${filePath}`)
			}

			await this.updateVideoState(
				videoId,
				VideoStatus.UPLOADING,
				10,
				'Запуск браузера...'
			)

			// 2. Запуск браузера
			context = await chromium.launchPersistentContext(
				`profiles/${video.accountId}`,
				{
					headless: true,
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

			const page = await context.newPage()

			page.on('response', async response => {
				try {
					// Нас интересуют только POST-запросы
					if (response.request().method() !== 'POST') return
					const url = response.url()

					// Фильтруем запросы, оставляя те, что похожи на публикацию
					if (
						/post|publish|item|commit|aweme|upload/i.test(url) &&
						url.includes('tiktok')
					) {
						const json = await response.json()

						// Ищем ID видео в разных вариантах структуры ответа TikTok
						const itemId =
							json?.item_id ||
							json?.data?.item_id ||
							json?.aweme_id ||
							json?.aweme?.aweme_id ||
							json?.video_id ||
							json?.data?.share_info?.share_url ||
							json?.single_post_resp_list?.[0]?.item_id // <-- ДОБАВЛЕНО СЮДА

						if (itemId) {
							if (typeof itemId === 'string' && itemId.startsWith('http')) {
								tiktokVideoUrl = itemId
							} else {
								const username = video.account?.profilePath || 'user'
								tiktokVideoUrl = `https://www.tiktok.com/@${username}/video/${itemId}`
							}
							this.logger.log(
								`[Upload] Успешно перехвачен URL видео из API: ${tiktokVideoUrl}`
							)
						}
					}
				} catch (e) {
					// Игнорируем ответы без тела JSON или прерванные запросы
				}
			})

			// Убрали глобальный хендлер 'Cancel', так как он ломал публикацию!
			// Оставили только безопасные хендлеры:
			page.addLocatorHandler(
				page.getByRole('button', { name: 'Got it' }),
				async btn => {
					await btn.click().catch(() => {})
				}
			)

			// Точечно обрабатываем окно "Turn on automatic content checks?"
			page.addLocatorHandler(
				page.getByText('Turn on automatic content checks?'),
				async () => {
					await page
						.getByRole('button', { name: 'Cancel' })
						.click()
						.catch(() => {})
				}
			)

			await this.updateVideoState(
				videoId,
				VideoStatus.UPLOADING,
				25,
				'Переход в TikTok Studio...'
			)

			await page.goto(
				'https://www.tiktok.com/tiktokstudio/upload?from=webapp',
				{ waitUntil: 'domcontentloaded' }
			)

			await this.updateVideoState(
				videoId,
				VideoStatus.UPLOADING,
				40,
				'Передача файла в инпут...'
			)

			// 3. Загрузка файла (увеличен таймаут до 30 секунд для медленных серверов)
			const fileInput = page.locator('input[type="file"]')
			await fileInput.waitFor({ state: 'attached', timeout: 30000 })
			await fileInput.setInputFiles(filePath)

			await this.updateVideoState(
				videoId,
				VideoStatus.UPLOADING,
				55,
				'Обработка видео сайтом TikTok...'
			)

			this.logger.log(`[Upload] Файл передан в браузер, ждем загрузки...`)

			// 4. Ждем, пока видео загрузится
			const editor = page.locator('.public-DraftEditor-content')
			await editor.waitFor({ state: 'visible', timeout: 120000 })

			this.logger.log(`[Upload] Видео загружено, заполняем данные...`)

			await this.updateVideoState(
				videoId,
				VideoStatus.UPLOADING,
				70,
				'Заполнение описания...'
			)

			// 5. Ввод описания
			await editor.click()
			await page.keyboard.press('Control+A')
			await page.keyboard.press('Backspace')

			const description = video.description || 'Hello world'
			await page.keyboard.type(description, { delay: 50 })
			await page.waitForTimeout(2000) // Даем TikTok обновить UI

			// 6. Публикация
			// Используем exact: true, чтобы не задеть другие элементы со словом Post

			await this.updateVideoState(
				videoId,
				VideoStatus.UPLOADING,
				85,
				'Публикация видео...'
			)

			const postBtn = page
				.getByRole('button', { name: 'Post', exact: true })
				.last()
			await postBtn.scrollIntoViewIfNeeded()
			await postBtn.waitFor({ state: 'visible' })

			this.logger.log(`[Upload] Нажимаем кнопку Post...`)
			await postBtn.click()

			// 7. Обработка окна "Проверка еще идет, опубликовать?"
			// TikTok часто показывает его сразу после клика "Post"
			try {
				this.logger.log(`[Upload] Проверяем модалку подтверждения...`)

				await this.updateVideoState(
					videoId,
					VideoStatus.UPLOADING,
					90,
					'Подтверждение досрочной публикации...'
				)

				// Добавили 'Post now' в регулярное выражение поиска кнопки
				const confirmBtn = page
					.getByRole('button', {
						name: /Post now|Continue|Post anyway|Continue to post/i
					})
					.last()

				// Ждем 5-7 секунд. Если модалки нет, скрипт пойдет дальше (упадет в catch)
				await confirmBtn.waitFor({ state: 'visible', timeout: 7000 })

				await confirmBtn.click()

				this.logger.log(
					`[Upload] Подтвердили досрочную публикацию (нажали Post now).`
				)
			} catch (e) {
				// Окно не появилось, это нормально. Идем дальше.
				this.logger.log(
					`[Upload] Модалка подтверждения не появилась, продолжаем...`
				)
			}

			await this.updateVideoState(
				videoId,
				VideoStatus.UPLOADING,
				95,
				'Ожидание подтверждения от сервера TikTok...'
			)

			// 8. Ожидание финального успеха
			this.logger.log(`[Upload] Ждем сообщения об успешной публикации...`)

			// Используем регулярное выражение, чтобы поймать ЛЮБОЕ сообщение об успехе:
			// "Video published", "Manage posts" или "uploaded"
			const successMessage = page
				.getByText(/Video published|Manage posts|video uploaded/i)
				.first()

			await successMessage.waitFor({ state: 'visible', timeout: 60000 })

			await this.updateVideoState(
				videoId,
				VideoStatus.POSTED,
				100,
				'Видео успешно опубликовано!',
				{
					tiktokVideoUrl,
					errorMessage: null
				}
			)

			this.logger.log(`[Upload] Успех! Видео ${videoId} опубликовано.`)

			if (existsSync(filePath)) {
				unlinkSync(filePath)
				this.logger.log(`[Upload] Временный файл удален.`)
			}

			await this.queue.add(
				'videoBanner',
				{
					videoId
				},
				{
					delay: 2 * 60 * 1000,
					attempts: 3
				}
			)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Неизвестная ошибка'

			this.logger.error(
				`[Upload] Ошибка при публикации видео ${videoId}: ${errorMessage}`
			)

			await this.updateVideoState(
				videoId,
				VideoStatus.FAILED,
				0,
				`Ошибка: ${errorMessage}`,
				{ errorMessage }
			)

			throw error
		} finally {
			if (context) {
				await context.close().catch(() => {})
				this.logger.log(`[Upload] Браузер закрыт.`)
			}

			if (filePath && existsSync(filePath)) {
				try {
					unlinkSync(filePath)
					this.logger.log(`[Upload] Временный файл успешно удален из системы.`)
				} catch (fsError) {
					this.logger.error(
						`[Upload] Не удалось удалить файл ${filePath}:`,
						fsError
					)
				}
			}
		}
	}

	async getBannerVideoImage(job: Job<{ videoId: string }>) {
		const { videoId } = job.data
		const video = await this.videosService.findById(videoId)

		let context: BrowserContext | null = null

		try {
			context = await chromium.launchPersistentContext(
				`profiles/${video.accountId}`,
				{
					headless: false,
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

			this.logger.log('Started banner')

			const page = await context.newPage()
			await page.goto(`https://tiktok.com/@${video.account.profilePath}`)

			const videoBlock = await page.locator(`a[href="${video.tiktokVideoUrl}"]`)

			await videoBlock.waitFor({
				state: 'visible',
				timeout: 10000
			})

			const bannerPath = await videoBlock.locator('img').getAttribute('src')

			await this.prismaService.video.update({
				where: {
					id: videoId
				},
				data: {
					bannerPath
				}
			})
		} catch (error) {
			const errorText = error instanceof Error ? error.message : String(error)
			this.logger.error(`[Get banner video] Ошибка: ${errorText}`)

			throw error
		} finally {
			if (context) {
				await context.close().catch(() => {})
				this.logger.log(`[Get banner video] Браузер закрыт.`)
			}
		}
	}

	private async updateVideoState(
		videoId: string,
		status: VideoStatus,
		progress: number,
		message: string,
		extraData?: {
			tiktokVideoUrl?: string | null
			errorMessage?: string | null
		}
	) {
		const updateData: Record<string, any> = { status }

		if (extraData?.tiktokVideoUrl !== undefined) {
			updateData.tiktokVideoUrl = extraData.tiktokVideoUrl
		}

		if (extraData?.errorMessage !== undefined) {
			updateData.errorMessage = extraData.errorMessage
		}

		try {
			// Обновляем запись в базе данных
			await this.prismaService.video.update({
				where: { id: videoId },
				data: updateData
			})

			// Отправляем событие изменения статуса через веб-сокет
			this.eventsGateway.emitToVideo(videoId, 'video:status_changed', {
				videoId,
				status,
				progress,
				message,
				tiktokVideoUrl: extraData?.tiktokVideoUrl ?? null,
				errorMessage: extraData?.errorMessage ?? null,
				timestamp: new Date().toISOString()
			})
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === 'P2025'
			) {
				this.logger.warn(
					`[VideoState] Запись ${videoId} удалена. Обновление статуса проигнорировано.`
				)
				return
			}
			throw error
		}
	}
}
