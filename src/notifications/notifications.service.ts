import { Injectable } from '@nestjs/common'
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
}
