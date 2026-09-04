import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
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

	@Get('me')
	@Auth()
	findByUserId(@GetAuthUser('id') userId: string) {
		return this.accountsService.findByUserId(userId)
	}

	@Get(':id')
	@Auth()
	findById(@GetAuthUser('id') userId: string, @Param('id') id: string) {
		return this.accountsService.findById(id, userId)
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

	@Auth()
	@Delete(':id')
	delete(@Param('id') id: string, @GetAuthUser('id') userId: string) {
		return this.accountsService.delete(id, userId)
	}

	@Auth()
	@Get(':id/dashboard')
	dashboard(@Param('id') id: string, @GetAuthUser('id') userId: string) {
		return this.accountsService.dashboard(id, userId)
	}
}
