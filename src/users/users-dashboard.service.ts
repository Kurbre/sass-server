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
			canceledVideos
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
			})
		])

		return {
			totalVideos,
			postedVideos,
			scheduledVideos,
			failedVideos,
			canceledVideos
		}
	}
}
