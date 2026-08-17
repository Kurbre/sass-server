import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { EventsModule } from 'src/events/events.module'

@Module({
	controllers: [NotificationsController],
	providers: [NotificationsService],
	imports: [EventsModule],
	exports: [NotificationsService]
})
export class NotificationsModule {}
