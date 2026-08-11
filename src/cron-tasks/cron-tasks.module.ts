import { Module } from '@nestjs/common'
import { CronTasksService } from './cron-tasks.service'
import { CronTasksController } from './cron-tasks.controller'
import { BrowserModule } from 'src/browser/browser.module'
import { ScheduleModule } from '@nestjs/schedule'

@Module({
	controllers: [CronTasksController],
	providers: [CronTasksService],
	imports: [BrowserModule, ScheduleModule.forRoot()]
})
export class CronTasksModule {}
