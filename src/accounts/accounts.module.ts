import { Module } from '@nestjs/common'
import { AccountsService } from './accounts.service'
import { AccountsController } from './accounts.controller'
import { BullModule } from '@nestjs/bullmq'

@Module({
	controllers: [AccountsController],
	providers: [AccountsService],
	imports: [
		BullModule.registerQueue({
			name: 'tiktok'
		})
	],
	exports: [AccountsService]
})
export class AccountsModule {}
