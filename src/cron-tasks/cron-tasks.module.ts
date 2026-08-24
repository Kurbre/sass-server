import { Module } from '@nestjs/common'
import { CronTasksService } from './cron-tasks.service'
import { CronTasksController } from './cron-tasks.controller'
import { TiktokModule } from 'src/tiktok/tiktok.module'
import { ScheduleModule } from '@nestjs/schedule'

@Module({
	controllers: [CronTasksController],
	providers: [CronTasksService],
	imports: [TiktokModule, ScheduleModule.forRoot()]
})
export class CronTasksModule {}
