import { Body, Controller, Get, Post } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { GetAuthUser } from 'src/users/decorators/users.decorator'

@Controller('notifications')
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	@Post()
	@Auth()
	create(
		@Body() dto: CreateNotificationDto,
		@GetAuthUser('id') userId: string
	) {
		return this.notificationsService.create(userId, dto)
	}

	@Get()
	@Auth()
	findUser(@GetAuthUser('id') userId: string) {
		return this.notificationsService.findUser(userId)
	}
}
