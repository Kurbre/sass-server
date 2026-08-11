import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { existsSync, rmSync } from 'fs'
import { BrowserContext, chromium, Page } from 'patchright'
import path from 'path'
import { BrowserLoginService } from './browser-login.service'
import { AccountsService } from 'src/accounts/accounts.service'

@Injectable()
export class BrowserService {
	private readonly logger = new Logger(BrowserService.name)

	constructor(private readonly accountsService: AccountsService) {}

	async getTikTokSecuid(context: BrowserContext) {
		try {
			// 1. Быстрый метод: отправляем API-запрос напрямую через контекст браузера (с сохранившимися куками)
			const apiResponse = await context.request.get(
				'https://www.tiktok.com/passport/web/account/info/',
				{ timeout: 5000 }
			)

			if (apiResponse.ok()) {
				const json = await apiResponse.json()
				const secUid = json?.data?.sec_user_id

				if (secUid) {
					this.logger.log(`[ID] secUid получен за 1 сек: ${secUid}`)
					return secUid
				}
			}

			// 2. Резервный метод: если API вернул 403 или пустой ответ, открываем легкую страницу
			const page = await context.newPage()
			try {
				await page.goto('https://www.tiktok.com/login', {
					waitUntil: 'commit', // Не ждем даже DOM, только установки сетевого соединения
					timeout: 10000
				})

				const secUid = await page.evaluate(async () => {
					try {
						const res = await fetch('/passport/web/account/info/')
						const data = await res.json()
						return data?.data?.sec_user_id || null
					} catch {
						return null
					}
				})

				if (!secUid || typeof secUid !== 'string') {
					throw new Error('TikTok secUid not found. Сессия не авторизована.')
				}

				return secUid
			} finally {
				await page.close().catch(() => {})
			}
		} catch (error) {
			this.logger.error(
				`[ID] Ошибка получения secuid: ${error instanceof Error ? error.message : error}`
			)
			throw error
		}
	}

	async logout(job: Job<{ accountId: string; userId: string }>) {
		const { accountId, userId } = job.data
		let context: BrowserContext | null = null

		try {
			this.logger.log(`[Logout] Запуск браузера для аккаунта ${accountId}...`)

			context = await chromium.launchPersistentContext(
				`profiles/${accountId}`,
				{
					headless: true, // Для логаута графический интерфейс не нужен, делаем headless
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

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
			const profilePath = path.resolve(`profiles/${accountId}`)
			if (existsSync(profilePath)) {
				rmSync(profilePath, { recursive: true, force: true })
			}

			await this.accountsService
				.update(
					accountId,
					{
						connected: false
					},
					userId
				)
				.catch(err =>
					this.logger.error(`[Logout] Ошибка обновления БД: ${err.message}`)
				)

			this.logger.log(`[Logout] Процесс выхода для ${accountId} завершен.`)
		}
	}

	async isLoggedIn(context: BrowserContext) {
		try {
			if (!context || !context.browser()?.isConnected()) {
				return false
			}

			// 1. Быстрая локальная проверка наличия куки
			const cookies = await context.cookies()
			const hasSessionCookie = cookies.some(
				c => c.name === 'sessionid' && c.value
			)

			if (!hasSessionCookie) {
				return false
			}

			// 2. Реальная проверка актуальности сессии через API TikTok
			const response = await context.request.get(
				'https://www.tiktok.com/passport/web/account/info/',
				{ timeout: 5000 }
			)

			if (!response.ok()) {
				return false
			}

			const json = await response.json()

			// У разлогиненного аккаунта data будет пустым или не содержит user_id/sec_user_id
			const isAuthorized = Boolean(
				json?.data?.user_id || json?.data?.sec_user_id
			)

			return isAuthorized
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)

			if (!errorMessage.includes('closed')) {
				this.logger.warn(`[isLoggedIn] Ошибка проверки сессии: ${errorMessage}`)
			}
			return false
		}
	}
}
