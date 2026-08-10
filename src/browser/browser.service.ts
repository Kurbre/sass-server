import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { existsSync, rmSync } from 'fs'
import { BrowserContext, chromium, Page } from 'patchright'
import path from 'path'
import { BrowserLoginService } from './browser-login.service'

@Injectable()
export class BrowserService {
	private readonly logger = new Logger(BrowserService.name)

	constructor(private readonly browserLoginService: BrowserLoginService) {}

	async getTikTokId(accountId: string) {
		let context: BrowserContext | null = null

		try {
			context = await chromium.launchPersistentContext(
				`profiles/${accountId}`,
				{
					headless: false,
					executablePath: '/usr/bin/google-chrome'
				}
			)

			const page = await context.newPage()
			await page.goto('https://www.tiktok.com/', {
				waitUntil: 'domcontentloaded'
			})

			const secUid = await this.getSecUid(page)

			return { secUid }
		} catch (error) {
			this.logger.error(
				`[ID] Ошибка: ${error instanceof Error ? error.message : error}`
			)
			throw error
		} finally {
			if (context) {
				await context.close().catch(() => {})
				this.logger.log(`[ID] Браузер закрыт.`)
			}
		}
	}

	private async getSecUid(page: Page): Promise<string> {
		// 1. Ждем появления и инициализации структуры данных именно залогиненного пользователя
		await page
			.waitForFunction(
				() => {
					const script = document.getElementById(
						'__UNIVERSAL_DATA_FOR_REHYDRATION__'
					)
					if (!script?.textContent) return false

					try {
						const data = JSON.parse(script.textContent)
						const user =
							data?.['__DEFAULT_SCOPE__']?.['webapp.app-context']?.user
						return Boolean(user && user.secUid)
					} catch {
						return false
					}
				},
				{ timeout: 15000, polling: 300 }
			)
			.catch(() => {
				// Игнорируем таймаут waitForFunction, чтобы попробовать фолбэк
			})

		// 2. Извлекаем secUid из DOM или через прямой API-запрос текущей сессии
		const secUid = await page.evaluate(async () => {
			// Способ А: Из тега гидратации
			const script = document.getElementById(
				'__UNIVERSAL_DATA_FOR_REHYDRATION__'
			)
			if (script?.textContent) {
				try {
					const data = JSON.parse(script.textContent)
					const user = data?.['__DEFAULT_SCOPE__']?.['webapp.app-context']?.user
					if (user?.secUid) return user.secUid as string
				} catch {}
			}

			// Способ Б (Фолбэк): Прямой запрос к внутреннему API сессии TikTok в контексте браузера
			try {
				const res = await fetch('/passport/web/account/info/')
				const json = await res.json()
				if (json?.data?.sec_user_id) {
					return json.data.sec_user_id as string
				}
			} catch {}

			return null
		})

		if (!secUid) {
			throw new Error(
				'TikTok secUid not found. Возможно, сессия не авторизована.'
			)
		}

		return secUid
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
			const isLoggedIn = await this.browserLoginService.isLoggedIn(context)

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
			if (existsSync(profilePath)) {
				rmSync(profilePath, { recursive: true, force: true })
			}
		}
	}
}
