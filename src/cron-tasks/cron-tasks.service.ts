import { Injectable, Logger } from '@nestjs/common'
import { Account } from '@prisma/client'
import { BrowserContext, chromium } from 'patchright'
import { BrowserService } from 'src/browser/browser.service'
import { EventsGateway } from 'src/events/events.gateway'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class CronTasksService {
	private readonly logger = new Logger(CronTasksService.name)
	private isAccountChecking = false
	private isVideoChecking = false

	constructor(
		private readonly prismaService: PrismaService,
		private readonly browserService: BrowserService,
		private readonly eventsGateway: EventsGateway
	) {}

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

			const isLoggedIn = await this.browserService.isLoggedIn(context)

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
}
