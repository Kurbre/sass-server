import { Module } from '@nestjs/common'
import { CronTasksService } from './cron-tasks.service'
import { CronTasksController } from './cron-tasks.controller'
import { BrowserModule } from 'src/browser/browser.module'

@Module({
	controllers: [CronTasksController],
	providers: [CronTasksService],
	imports: [BrowserModule]
})
export class CronTasksModule {}
