import {
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { EventsGateway } from 'src/events/events.gateway'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateNotificationDto } from './dto/create-notification.dto'

@Injectable()
export class NotificationsService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly eventsGateway: EventsGateway
	) {}

	async create(userId: string, dto: CreateNotificationDto) {
		const notification = await this.prismaService.notification.create({
			data: {
				message: dto.message,
				userId
			}
		})

		await this.eventsGateway.emitToUser(userId, 'notification', notification)

		return notification
	}

	async findUser(userId: string) {
		return this.prismaService.notification.findMany({
			where: {
				userId
			}
		})
	}

	async findById(id: string) {
		const notification = await this.prismaService.notification.findUnique({
			where: { id }
		})
		if (!notification) throw new NotFoundException('Notification not found')

		return notification
	}

	async markReadNotification(id: string, userId: string) {
		const notification = await this.findById(id)
		if (notification.userId !== userId)
			throw new ForbiddenException('Not access')

		return this.prismaService.notification.update({
			where: { id },
			data: {
				isRead: true
			}
		})
	}

	async markReadAllNotification(userId: string) {
		return this.prismaService.notification.updateMany({
			where: {
				userId,
				isRead: false
			},
			data: {
				isRead: true
			}
		})
	}
}
