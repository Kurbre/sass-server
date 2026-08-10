import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { AccountType, BrowserSessionStatus, VideoStatus } from '@prisma/client'
import { Job } from 'bullmq'
import fs, { existsSync, mkdirSync, rmSync } from 'fs'
import { BrowserContext, chromium } from 'patchright'
import path from 'path'
import { AccountsService } from 'src/accounts/accounts.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { BrowserService } from './browser.service'
import { EventsGateway } from 'src/events/events.gateway'

@Injectable()
export class BrowserLoginService {
	private readonly logger = new Logger(BrowserLoginService.name)

	constructor(
		private readonly prismaService: PrismaService,
		private readonly accountsService: AccountsService,
		private readonly browserService: BrowserService,
		private readonly eventsGateway: EventsGateway
	) {}

	async login(job: Job<{ sessionId: string; userId: string }>) {
		const { sessionId, userId } = job.data

		const session = await this.accountsService.findSessionById(
			sessionId,
			userId
		)

		if (!session) {
			this.logger.error('[Bull MQ - Create Browser] - session not found!')
			return
		}

		let context: BrowserContext | null = null
		let shouldDeleteProfileFolder = false

		try {
			context = await chromium.launchPersistentContext(
				`profiles/${session.accountId}`,
				{
					headless: false,
					executablePath: '/usr/bin/google-chrome'
				}
			)

			const page = await context.newPage()

			await page.goto('https://www.tiktok.com/login')

			await page.waitForTimeout(3000)

			let loggedIn = await this.browserService.isLoggedIn(context)

			if (!loggedIn) {
				await page.getByRole('link', { name: 'Use QR code' }).click()

				await page.locator('canvas').waitFor({
					state: 'visible'
				})

				const tmpDir = path.resolve('tmp')
				if (!existsSync(tmpDir)) {
					mkdirSync(tmpDir, { recursive: true })
				}

				const qr = await page.locator('canvas')

				await qr.screenshot({
					path: `tmp/${sessionId}.png`
				})

				await this.eventsGateway.emitToUser(
					session.account.userId,
					'tiktokAuthQr',
					{
						fileName: `${sessionId}.png`,
						sessionId: session.id,
						accountId: session.accountId
					}
				)

				await this.prismaService.browserSession.update({
					where: { id: sessionId },
					data: {
						qrImagePath: `${sessionId}.png`,
						status: BrowserSessionStatus.WAITING_QR
					}
				})

				loggedIn = await this.waitForLogin(
					context,
					session.expiresAt,
					path.resolve(`tmp/${sessionId}.png`)
				)
			}

			if (loggedIn) {
				await this.eventsGateway.emitToUser(
					session.account.userId,
					'tiktokAuth',
					{
						message: `Вы успешно вошли в tiktok аккаунт, идет збор информации.`,
						isLogin: true,
						isError: false,
						sessionId: session.id,
						accountId: session.accountId
					}
				)

				const profileBtn = await page.getByRole('listitem', { name: 'Profile' })
				await profileBtn.waitFor({ state: 'visible', timeout: 12000 })
				await profileBtn.click()

				const username =
					(await page
						.locator('[data-e2e="user-title"]')
						.first()
						.textContent()) || ''
				const profilePath =
					(await page
						.locator('[data-e2e="user-subtitle"]')
						.first()
						.textContent()) || ''

				const secuid = await this.browserService.getTikTokSecuid(context)

				if (session.account.secuid && session.account.secuid !== secuid) {
					const expectedAccount =
						session.account.profilePath ||
						session.account.username ||
						'исходный аккаунт'
					const errorMsg = `Вы подключаете аккаунт ${profilePath}, а система ожидает ${expectedAccount}`

					await this.eventsGateway.emitToUser(
						session.account.userId,
						'tiktokAuth',
						{
							message: errorMsg,
							isLogin: true,
							isError: true,
							sessionId: session.id,
							accountId: session.accountId
						}
					)
					this.logger.warn(`[Create Browser] ${errorMsg}`)

					await context.clearCookies().catch(() => {})
					shouldDeleteProfileFolder = true

					await this.prismaService.browserSession.update({
						where: { id: sessionId },
						data: { status: BrowserSessionStatus.FAILED }
					})

					return
				}

				await this.prismaService.browserSession.update({
					where: { id: sessionId },
					data: {
						status: BrowserSessionStatus.CONNECTED
					}
				})

				await this.accountsService.update(
					session.accountId,
					{
						connected: true,
						profilePath,
						username,
						secuid
					},
					userId
				)

				await this.prismaService.browserSession.delete({
					where: {
						id: sessionId
					}
				})
			} else {
				await this.prismaService.browserSession.delete({
					where: { id: sessionId }
				})
			}
		} catch (error) {
			const errorText = error instanceof Error ? error.message : String(error)
			this.logger.error(`[Create Browser] Ошибка: ${errorText}`)

			if (session?.account?.userId) {
				this.eventsGateway.emitToUser(session.account.userId, 'tiktokAuth', {
					message: errorText || 'Ошибка авторизации',
					isLogin: false,
					isError: true,
					sessionId: session.id,
					accountId: session.accountId
				})
			}

			await this.prismaService.browserSession
				.update({
					where: { id: sessionId },
					data: { status: BrowserSessionStatus.FAILED }
				})
				.catch(() => {})
			throw error
		} finally {
			if (context) {
				await context.close().catch(() => {})
				this.logger.log(`[Upload] Браузер закрыт.`)
			}

			if (shouldDeleteProfileFolder) {
				const profilePathFolder = path.resolve(`profiles/${session.accountId}`)
				if (existsSync(profilePathFolder)) {
					rmSync(profilePathFolder, { recursive: true, force: true })
					this.logger.log(`[Upload] Неверный профиль удален с диска.`)
				}
			}
		}
	}

	private async waitForLogin(
		context: BrowserContext,
		expiresAt: Date,
		filePath: string | undefined
	): Promise<boolean> {
		const checkIntervalMs = 5000

		try {
			while (Date.now() < expiresAt.getTime()) {
				if (context.pages().length === 0) {
					this.logger.warn('[waitForLogin] Контекст закрыт извне.')
					return false
				}

				const loggedIn = await this.browserService.isLoggedIn(context)
				console.log(loggedIn)

				if (loggedIn) {
					this.logger.log('[waitForLogin] Пользователь успешно авторизовался.')

					return true
				}

				// Ждем 5 секунд перед следующей проверкой
				await new Promise(resolve => setTimeout(resolve, checkIntervalMs))
			}
		} catch (e) {
			this.logger.error(
				'Контекст браузера был закрыт до завершения авторизации.'
			)

			return false
		} finally {
			if (filePath && fs.existsSync(filePath)) {
				fs.unlinkSync(filePath)
				this.logger.log(`[Upload] Временный файл удален.`)
			}
		}

		this.logger.warn('[waitForLogin] Истекло время ожидания входа (5 минут).')
		return false
	}
}
