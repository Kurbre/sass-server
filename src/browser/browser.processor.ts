import { Processor, WorkerHost } from '@nestjs/bullmq'
import { BadRequestException, Logger } from '@nestjs/common'
import { BrowserSessionStatus, VideoStatus } from '@prisma/client'
import { Job } from 'bullmq'
import fs from 'fs'
import { BrowserContext, chromium } from 'patchright'
import path from 'path'
import { PrismaService } from 'src/prisma/prisma.service'
import { VideosService } from 'src/videos/videos.service'

@Processor('browser')
export class BrowserProcessor extends WorkerHost {
	private logger = new Logger(BrowserProcessor.name)

	constructor(
		private readonly prismaService: PrismaService,
		private readonly videosService: VideosService
	) {
		super()
	}

	async process(job: Job): Promise<any> {
		if (job.name === 'create-browser') return this.createBrowser(job)
		if (job.name === 'uploaded') return this.uploadVideo(job)
		if (job.name === 'logout') return this.logout(job)
	}

	async logout(job: Job<{ userId: string }>) {
		const { userId } = job.data
		let context: BrowserContext | null = null

		try {
			this.logger.log(
				`[Logout] Запуск браузера для выхода пользователя ${userId}...`
			)

			context = await chromium.launchPersistentContext(`profiles/${userId}`, {
				headless: false, // Для логаута графический интерфейс не нужен, делаем headless
				executablePath: '/usr/bin/google-chrome',
				args: ['--no-sandbox', '--disable-setuid-sandbox']
			})

			const page = await context.newPage()
			await page.goto('https://www.tiktok.com', {
				waitUntil: 'domcontentloaded',
				timeout: 30000
			})

			// Проверяем, залогинен ли пользователь вообще
			const isLoggedIn = await this.isLoggedIn(context)

			if (isLoggedIn) {
				// Ищем профиль/меню и кликаем Log out
				const moreButton = await page.getByRole('listitem', { name: 'More' })
				await moreButton.waitFor({ state: 'visible' })
				await moreButton.click()

				const logoutBtn = page
					.getByRole('listbox', { name: 'Log out' })
					.or(page.getByText('Log out'))
					.first()

				await logoutBtn.click({ timeout: 5000 })

				// Подтверждение выходя в модальном окне
				const confirmLogout = page
					.getByRole('button', { name: 'Log out' })
					.last()
				await confirmLogout.click({ timeout: 5000 })

				await page.waitForTimeout(2000)
			}

			// Очищаем куки в контексте
			await context.clearCookies()

			this.logger.log(`[Logout] Успешный выход из TikTok для ${userId}`)
		} catch (error) {
			this.logger.error(
				`[Logout] Ошибка клика выходя в TikTok: ${
					error instanceof Error ? error.message : error
				}. Принудительно очищаем профиль.`
			)
		} finally {
			// Гарантированно закрываем браузер
			if (context) {
				await context.close().catch(() => {})
			}

			// В любом случае (успех или ошибка) чистим папку с диска
			const profilePath = path.resolve(`profiles/${userId}`)
			if (fs.existsSync(profilePath)) {
				fs.rmSync(profilePath, { recursive: true, force: true })
			}
		}
	}

	async uploadVideo(job: Job<{ videoId: string }>) {
		const { videoId } = job.data
		const video = await this.videosService.findById(videoId)
		let context

		const filePath = path.resolve(video.file)

		try {
			this.logger.log(`[Upload] Начало загрузки видео ${videoId}`)

			// 1. Скачиваем видео во временный файл
			if (!fs.existsSync(filePath)) {
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
			if (filePath && fs.existsSync(filePath)) {
				fs.unlinkSync(filePath)
				this.logger.log(`[Upload] Временный файл удален.`)
			}
		}
	}

	async createBrowser(job: Job<{ sessionId: string }>) {
		const { sessionId } = job.data

		const session = await this.prismaService.browserSession.findUnique({
			where: { id: sessionId }
		})
		if (!session) {
			this.logger.error('[Bull MQ - Create Browser] - session not found!')
			return
		}

		const context = await chromium.launchPersistentContext(
			`profiles/${session.userId}`,
			{
				headless: false,
				executablePath: '/usr/bin/google-chrome'
			}
		)

		console.log('browser started...')

		const page = await context.newPage()

		await page.goto('https://www.tiktok.com/login')

		console.log(
			await page.evaluate(() => ({
				webdriver: navigator.webdriver,
				ua: navigator.userAgent
			}))
		)

		await page.waitForTimeout(3000)

		await page.getByRole('link', { name: 'Use QR code' }).click()

		await page.locator('canvas').waitFor({
			state: 'visible'
		})

		try {
			const qr = await page.locator('canvas')

			console.log('count:', await qr.count())

			await qr.screenshot({
				path: `tmp/${sessionId}.png`
			})
		} catch (e) {
			console.error(e)
		}

		await this.prismaService.browserSession.update({
			where: { id: sessionId },
			data: {
				qrImagePath: `${sessionId}.png`,
				status: BrowserSessionStatus.WAITING_QR
			}
		})

		const loggedIn = await this.waitForLogin(
			context,
			path.resolve(`tmp/${sessionId}.png`)
		)

		if (loggedIn) {
			await this.prismaService.browserSession.update({
				where: { id: sessionId },
				data: {
					status: BrowserSessionStatus.CONNECTED
				}
			})
		} else {
			// Опционально: если за 5 минут не залогинились, можно менять статус на FAILED/TIMEOUT
			await this.prismaService.browserSession.update({
				where: { id: sessionId },
				data: {
					status: BrowserSessionStatus.EXPIRED
				}
			})
		}
	}

	private async isLoggedIn(context: BrowserContext) {
		const cookies = await context.cookies()

		return cookies.some(c => c.name === 'sessionid')
	}

	private async waitForLogin(
		context: BrowserContext,
		filePath: string | undefined
	): Promise<boolean> {
		const checkIntervalMs = 45 * 1000 // 45 секунд
		const timeoutMs = 5 * 60 * 1000 // 5 минут (300 секунд)
		const startTime = Date.now()

		try {
			while (Date.now() - startTime < timeoutMs) {
				// Проверяем статус авторизации

				const loggedIn = await this.isLoggedIn(context)
				console.log(loggedIn)

				if (loggedIn) {
					this.logger.log('[waitForLogin] Пользователь успешно авторизовался.')

					return true
				}

				// Ждем 45 секунд перед следующей проверкой
				await new Promise(resolve => setTimeout(resolve, checkIntervalMs))
			}
		} catch (e) {
			this.logger.error(
				'Контекст браузера был закрыт до завершения авторизации.'
			)

			return false
		} finally {
			if (context) {
				await context.close().catch(() => {})
				this.logger.log(`[Upload] Браузер закрыт.`)
			}
			if (filePath && fs.existsSync(filePath)) {
				fs.unlinkSync(filePath)
				this.logger.log(`[Upload] Временный файл удален.`)
			}
		}

		this.logger.warn('[waitForLogin] Истекло время ожидания входа (5 минут).')
		return false
	}
}
