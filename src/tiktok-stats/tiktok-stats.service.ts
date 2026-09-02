import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { AccountType } from '@prisma/client'
import { Job, Queue } from 'bullmq'
import { BrowserContext, chromium } from 'patchright'
import { AccountsService } from 'src/accounts/accounts.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { UsersService } from 'src/users/users.service'

@Injectable()
export class TiktokStatsService {
	private readonly logger = new Logger(TiktokStatsService.name)

	constructor(
		private readonly prismaService: PrismaService,
		@InjectQueue('tiktok-stats') private readonly queue: Queue,
		private readonly accountsService: AccountsService
	) {}

	// @Cron(CronExpression.EVERY_30_MINUTES)
	async startAccountMetrics() {
		const accounts = await this.prismaService.account.findMany({
			where: {
				type: AccountType.TIKTOK,
				connected: true
			},
			select: { id: true }
		})

		for (const account of accounts) {
			this.logger.log(`Adding metrics job for account ${account.id}`)

			await this.queue.add(
				'get-metrics',
				{
					accountId: account.id
				},
				{
					attempts: 3,
					backoff: {
						type: 'exponential',
						delay: 5000
					}
				}
			)
		}
	}

	async getAccountMetrics(job: Job<{ accountId: string }>) {
		const { accountId } = job.data

		this.logger.log(`START ${job.name} ${JSON.stringify(job.data)}`)

		const account = await this.accountsService.findById(accountId)

		let context: BrowserContext | null = null
		try {
			this.logger.log('[Load metrics] Started browser')

			context = await chromium.launchPersistentContext(
				`profiles/${accountId}`,
				{
					headless: false,
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

			const page = await context.newPage()
			await page.goto(`https://tiktok.com/@${account.profilePath}`)

			const following = await page
				.locator('strong[data-e2e="following-count"]')
				.textContent()
			const followers = await page
				.locator('strong[data-e2e="followers-count"]')
				.textContent()
			const likes = await page
				.locator('strong[data-e2e="likes-count"]')
				.textContent()

			await this.prismaService.accountStats.upsert({
				where: {
					accountId
				},
				create: {
					accountId,
					followers: Number(followers),
					following: Number(following),
					likes: Number(likes)
				},
				update: {
					followers: Number(followers),
					following: Number(following),
					likes: Number(likes)
				}
			})
		} catch (error) {
			this.logger.error(
				`FAILED ${job.name} ${JSON.stringify(job.data)}`,
				error instanceof Error ? error.stack : String(error)
			)

			throw error
		} finally {
			if (context) {
				await context.close().catch(() => {})
			}
		}
	}
}
