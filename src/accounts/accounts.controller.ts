import { Body, Controller, Param, Post } from '@nestjs/common'
import { AccountsService } from './accounts.service'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { GetAuthUser } from 'src/users/decorators/users.decorator'
import { CreateAccountDto } from './dto/create-account.dto'

@Controller('accounts')
export class AccountsController {
	constructor(private readonly accountsService: AccountsService) {}

	@Auth()
	@Post(':accountId/connect/tiktok')
	connecTiktok(
		@GetAuthUser('id') userId: string,
		@Param('accountId') accountId: string
	) {
		return this.accountsService.connectTiktok(accountId, userId)
	}

	@Auth()
	@Post()
	create(@GetAuthUser('id') userId: string, @Body() dto: CreateAccountDto) {
		return this.accountsService.create(dto, userId)
	}

	@Auth()
	@Post(':id/logout/tiktok')
	logout(@GetAuthUser('id') userId: string, @Param('id') id: string) {
		return this.accountsService.logout(id, userId)
	}
}
