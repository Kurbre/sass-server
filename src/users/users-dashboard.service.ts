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
		const [
			totalVideos,
			postedVideos,
			scheduledVideos,
			failedVideos,
			canceledVideos,
			accounts
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
			totalAccountsFollowing
		}
	}
}
