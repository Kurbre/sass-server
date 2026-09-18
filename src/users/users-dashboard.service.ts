import { Injectable } from '@nestjs/common'
import { UsersService } from './users.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { VideoStatus } from '@prisma/client'

@Injectable()
export class UsersDashboardService {
	constructor(
		private readonly usersService: UsersService,
		private readonly prismaService: PrismaService
	) {}

	async dashboard(userId: string) {
		const startOfToday = new Date()
		startOfToday.setHours(0, 0, 0, 0)

		const startOfTomorrow = new Date(startOfToday)
		startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

		const startOfMonth = new Date(startOfToday)
		startOfMonth.setDate(1)

		const startOfNextMonth = new Date(startOfMonth)
		startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1)

		const [
			totalVideos,
			postedVideos,
			scheduledVideos,
			failedVideos,
			canceledVideos,
			accounts,
			scheduledVideoToday,
			postedVideosPerMonth
		] = await Promise.all([
			this.prismaService.video.count({
				where: {
					userId
				}
			}),
			this.prismaService.video.count({
				where: {
					userId,
					status: VideoStatus.POSTED
				}
			}),
			this.prismaService.video.count({
				where: {
					userId,
					status: VideoStatus.SCHEDULED
				}
			}),
			this.prismaService.video.count({
				where: {
					userId,
					status: VideoStatus.FAILED
				}
			}),
			this.prismaService.video.count({
				where: {
					userId,
					status: VideoStatus.CANCELED
				}
			}),
			this.prismaService.account.findMany({
				where: {
					userId
				},
				include: {
					stats: true
				}
			}),
			this.prismaService.video.count({
				where: {
					userId,
					status: VideoStatus.SCHEDULED,
					scheduledAt: {
						gte: startOfToday,
						lt: startOfTomorrow
					}
				}
			}),
			this.prismaService.video.count({
				where: {
					userId,
					status: VideoStatus.POSTED,
					createdAt: {
						gte: startOfMonth,
						lt: startOfNextMonth
					}
				}
			})
		])

		const totalAccountsLikes = accounts.reduce(
			(acc, cur) => acc + (cur.stats.at(-1)?.likes ?? 0),
			0
		)

		const totalAccountsFollowers = accounts.reduce(
			(acc, cur) => acc + (cur.stats.at(-1)?.followers ?? 0),
			0
		)

		const totalAccountsFollowing = accounts.reduce(
			(acc, cur) => acc + (cur.stats.at(-1)?.following ?? 0),
			0
		)

		return {
			totalVideos,
			postedVideos,
			scheduledVideos,
			failedVideos,
			canceledVideos,
			totalAccountsLikes,
			totalAccountsFollowers,
			totalAccountsFollowing,
			accounts,
			scheduledVideoToday,
			postedVideosPerMonth
		}
	}
}
