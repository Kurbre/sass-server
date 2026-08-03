import { Controller, Param, Post } from '@nestjs/common'
import { AccountsService } from './accounts.service'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { GetAuthUser } from 'src/users/decorators/users.decorator'

@Controller('accounts')
export class AccountsController {
	constructor(private readonly accountsService: AccountsService) {}

	@Auth()
	@Post('connect/tiktok')
	connecTiktok(@GetAuthUser('id') userId: string) {
		return this.accountsService.connectTiktok(userId)
	}

	@Auth()
	@Post('connect/tiktok/qr/:sessionId')
	getQRTiktok(
		@GetAuthUser('id') userId: string,
		@Param('sessionId') sessionId: string
	) {
		return this.accountsService.findSessionById(sessionId, userId)
	}

	@Auth()
	@Post('logout/tiktok')
	logout(@GetAuthUser('id') userId: string) {
		return this.accountsService.logout(userId)
	}
}
