import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { GetAuthUser } from 'src/users/decorators/users.decorator'

@Controller('notifications')
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	@Get()
	@Auth()
	findUser(@GetAuthUser('id') userId: string) {
		return this.notificationsService.findUser(userId)
	}

	@Patch('mark-read/:id')
	@Auth()
	markReadNotification(
		@GetAuthUser('id') userId: string,
		@Param('id') id: string
	) {
		return this.notificationsService.markReadNotification(id, userId)
	}

	@Patch('mark-read-all')
	@Auth()
	markAllReadNotification(@GetAuthUser('id') userId: string) {
		return this.notificationsService.markReadAllNotification(userId)
	}
}
