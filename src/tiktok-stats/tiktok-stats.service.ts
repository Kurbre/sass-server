import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { AccountType, VideoStatus } from '@prisma/client'
import { Job, Queue } from 'bullmq'
import { BrowserContext, chromium } from 'patchright'
import { AccountsService } from 'src/accounts/accounts.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { UsersService } from 'src/users/users.service'
import { VideosService } from 'src/videos/videos.service'

@Injectable()
export class TiktokStatsService {
	private readonly logger = new Logger(TiktokStatsService.name)

	constructor(
		private readonly prismaService: PrismaService,
		@InjectQueue('tiktok-stats') private readonly queue: Queue,
		private readonly accountsService: AccountsService,
		private readonly videosService: VideosService
	) {}

	@Cron(CronExpression.EVERY_30_MINUTES)
	async startAccountMetrics() {
		const accounts = await this.prismaService.account.findMany({
			where: {
				type: AccountType.TIKTOK,
				connected: true
			},
			select: { id: true }
		})

		for (const account of accounts) {
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

		const account = await this.accountsService.findById(accountId)

		let context: BrowserContext | null = null
		try {
			context = await chromium.launchPersistentContext(
				`profiles/${accountId}`,
				{
					headless: true,
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

			const page = await context.newPage()
			await page.goto(`https://tiktok.com/@${account.profilePath}`)

			const followingItem = await page.locator(
				'strong[data-e2e="following-count"]'
			)
			await followingItem.waitFor({
				state: 'visible',
				timeout: 10000
			})
			const following = await followingItem.textContent()

			const followersItem = await page.locator(
				'strong[data-e2e="followers-count"]'
			)
			await followersItem.waitFor({
				state: 'visible',
				timeout: 10000
			})
			const followers = await followersItem.textContent()

			const likesItem = await page.locator('strong[data-e2e="likes-count"]')
			await likesItem.waitFor({
				state: 'visible',
				timeout: 10000
			})
			const likes = await likesItem.textContent()

			await this.prismaService.accountStats.create({
				data: {
					accountId,
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

	@Cron(CronExpression.EVERY_10_MINUTES)
	async startVideoMetrics() {
		const videos = await this.prismaService.video.findMany({
			where: {
				status: VideoStatus.POSTED,
				tiktokVideoUrl: {
					not: null
				}
			},
			select: {
				id: true
			}
		})

		for (const video of videos) {
			await this.queue.add(
				'get-video-metrics',
				{
					videoId: video.id
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

	async getVideoMetrics(job: Job<{ videoId: string }>) {
		const { videoId } = job.data
		const video = await this.videosService.findById(videoId)

		if (!video || !video.tiktokVideoUrl) {
			return
		}

		let context: BrowserContext | null = null

		try {
			this.logger.log('statred video metrics')
			context = await chromium.launchPersistentContext(
				`profiles/${video.accountId}`,
				{
					headless: true,
					executablePath: '/usr/bin/google-chrome',
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			)

			const page = await context.newPage()
			await page.goto(video.tiktokVideoUrl, { waitUntil: 'domcontentloaded' })

			await page.waitForTimeout(3000)

			// Извлекаем точные метрики из JSON гидрации TikTok
			const stats = await page
				.waitForFunction(
					() => {
						try {
							const script = document.getElementById(
								'__UNIVERSAL_DATA_FOR_REHYDRATION__'
							)

							if (!script?.textContent) {
								return null
							}

							const data = JSON.parse(script.textContent)

							const itemStruct =
								data.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo
									?.itemStruct

							if (!itemStruct?.stats) {
								return null
							}

							return {
								playCount: Number(itemStruct.stats.playCount ?? 0),
								diggCount: Number(itemStruct.stats.diggCount ?? 0),
								commentCount: Number(itemStruct.stats.commentCount ?? 0),
								shareCount: Number(itemStruct.stats.shareCount ?? 0),
								collectCount: Number(itemStruct.stats.collectCount ?? 0)
							}
						} catch {
							return null
						}
					},
					undefined,
					{
						timeout: 15000,
						polling: 500
					}
				)
				.then(async handle => {
					const value = await handle.jsonValue()
					await handle.dispose()
					return value
				})
			if (stats === null) {
				throw new Error(`Failed to views metrics for video ${videoId}`)
			}

			await this.prismaService.$transaction([
				this.prismaService.video.update({
					where: { id: videoId },
					data: {
						views: stats.playCount,
						likes: stats.diggCount,
						comments: stats.commentCount,
						shares: stats.shareCount,
						favorites: stats.collectCount
					}
				}),

				this.prismaService.videoStats.create({
					data: {
						videoId,
						views: stats.playCount,
						likes: stats.diggCount,
						comments: stats.commentCount,
						shares: stats.shareCount,
						favorites: stats.collectCount
					}
				})
			])
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
