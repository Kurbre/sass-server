import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { VideoStatus } from '@prisma/client'
import { Job } from 'bullmq'
import { existsSync, unlinkSync } from 'fs'
import { chromium } from 'patchright'
import { resolve } from 'path'
import { PrismaService } from 'src/prisma/prisma.service'
import { VideosService } from 'src/videos/videos.service'

@Injectable()
export class BrowserUploadService {
	private logger = new Logger(BrowserUploadService.name)

	constructor(
		private readonly prismaService: PrismaService,
		private readonly videosService: VideosService
	) {}

	async uploadVideo(job: Job<{ videoId: string }>) {
		const { videoId } = job.data
		const video = await this.videosService.findById(videoId)
		let context

		const filePath = resolve(video.file)

		try {
			this.logger.log(`[Upload] Начало загрузки видео ${videoId}`)

			// 1. Скачиваем видео во временный файл
			if (!existsSync(filePath)) {
				throw new BadRequestException(`Файл не найден на сервере: ${filePath}`)
			}

			// 2. Запуск браузера
			context = await chromium.launchPersistentContext(
				`profiles/${video.userId}`,
				{
					headless: false,
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

			const page = await context.newPage()

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

			await page.goto(
				'https://www.tiktok.com/tiktokstudio/upload?from=webapp',
				{ waitUntil: 'domcontentloaded' }
			)

			// 3. Загрузка файла (увеличен таймаут до 30 секунд для медленных серверов)
			const fileInput = page.locator('input[type="file"]')
			await fileInput.waitFor({ state: 'attached', timeout: 30000 })
			await fileInput.setInputFiles(filePath)

			this.logger.log(`[Upload] Файл передан в браузер, ждем загрузки...`)

			// 4. Ждем, пока видео загрузится
			const editor = page.locator('.public-DraftEditor-content')
			await editor.waitFor({ state: 'visible', timeout: 120000 })

			this.logger.log(`[Upload] Видео загружено, заполняем данные...`)

			// 5. Ввод описания
			await editor.click()
			await page.keyboard.press('Control+A')
			await page.keyboard.press('Backspace')

			const description = video.description || 'Hello world'
			await page.keyboard.type(description, { delay: 50 })
			await page.waitForTimeout(2000) // Даем TikTok обновить UI

			// 6. Публикация
			// Используем exact: true, чтобы не задеть другие элементы со словом Post
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

			// 8. Ожидание финального успеха
			this.logger.log(`[Upload] Ждем сообщения об успешной публикации...`)

			// Используем регулярное выражение, чтобы поймать ЛЮБОЕ сообщение об успехе:
			// "Video published", "Manage posts" или "uploaded"
			const successMessage = page
				.getByText(/Video published|Manage posts|video uploaded/i)
				.first()

			await successMessage.waitFor({ state: 'visible', timeout: 60000 })

			this.logger.log(`[Upload] Успех! Видео ${videoId} опубликовано.`)

			await this.prismaService.video.update({
				where: { id: video.id },
				data: { status: VideoStatus.POSTED }
			})
		} catch (error) {
			if (error instanceof Error)
				this.logger.error(
					`[Upload] Ошибка при публикации видео ${videoId}: ${error.message}`
				)

			await this.prismaService.video.update({
				where: { id: video.id },
				data: { status: VideoStatus.FAILED }
			})

			throw error
		} finally {
			if (context) {
				await context.close().catch(() => {})
				this.logger.log(`[Upload] Браузер закрыт.`)
			}
			if (filePath && existsSync(filePath)) {
				unlinkSync(filePath)
				this.logger.log(`[Upload] Временный файл удален.`)
			}
		}
	}
}
