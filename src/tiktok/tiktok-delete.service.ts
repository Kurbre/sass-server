import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { BrowserContext, chromium } from 'patchright'
import { EventsGateway } from 'src/events/events.gateway'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { VideosService } from 'src/videos/videos.service'

@Injectable()
export class TiktokDeleteService {
	private readonly logger = new Logger(TiktokDeleteService.name)

	constructor(
		private readonly prismaService: PrismaService,
		private readonly notificationsService: NotificationsService,
		private readonly videosService: VideosService
	) {}

	async delete(job: Job<{ videoId: string }>) {
		const { videoId } = job.data

		let context: BrowserContext | null = null

		const video = await this.videosService.findById(videoId)

		try {
			context = await chromium.launchPersistentContext(
				`profiles/${video.accountId}`,
				{
					headless: false,
					executablePath: '/usr/bin/google-chrome'
				}
			)

			const page = await context.newPage()

			await page.goto(`https://tiktok.com/@${video.account.profilePath}`)

			const videoItem = await page.locator(`a[href="${video.tiktokVideoUrl}"]`)

			await videoItem.waitFor({
				state: 'visible'
			})

			await videoItem.click()

			const settingsButton = await page.locator('div[data-e2e="video-setting"]')
			const settingsButtonCount = await settingsButton.count()

			if (settingsButtonCount > 0) {
				await settingsButton.waitFor({
					state: 'visible',
					timeout: 10000
				})

				await settingsButton.hover()

				const deleteButton = page.getByText('Delete', { exact: true }).last()

				await deleteButton.scrollIntoViewIfNeeded()

				await deleteButton.click({
					force: true
				})
			} else {
				const settingsButtonTwo = await page.locator(
					'div:nth-child(2) > .tiktok-12m0k8p > .tux-web-canary > .tux-button__element__ZBq38f_v1_8_0'
				)

				await settingsButtonTwo.waitFor({
					state: 'visible',
					timeout: 10000
				})

				await settingsButtonTwo.click()

				const deleteSettingsButton = await page
					.locator('div')
					.filter({ hasText: /^Delete$/ })

				await deleteSettingsButton.waitFor({
					state: 'visible',
					timeout: 10000
				})

				await deleteSettingsButton.click()
			}

			const confirmDeleteButton = await page.locator(
				'button[data-e2e="video-modal-delete"]'
			)

			await confirmDeleteButton.waitFor({
				state: 'visible',
				timeout: 10000
			})

			await confirmDeleteButton.click()

			const deletedMessage = page.getByText('Deleted', {
				exact: true
			})

			await deletedMessage.waitFor({
				state: 'visible',
				timeout: 15000
			})

			this.logger.log(`TikTok подтвердил удаление видео ${videoId}`)

			await this.prismaService.video.delete({
				where: { id: videoId }
			})

			await this.notificationsService.create(video.userId, {
				message: `Видео с идентификатором ${videoId} успешно удалено`
			})

			this.logger.log(`Видео ${videoId} удалено из базы данных`)
		} catch (error) {
			const errorText = error instanceof Error ? error.message : String(error)
			this.logger.error(`[Delete video] Ошибка: ${errorText}`)

			await this.notificationsService.create(video.userId, {
				message: `Видео с идентификатором ${videoId} не удалось удалить`
			})

			throw error
		} finally {
			if (context) {
				await context.close().catch(() => {})
				this.logger.log(`[Upload] Браузер закрыт.`)
			}
		}
	}
}
