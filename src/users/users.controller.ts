import { Controller, Get } from '@nestjs/common'
import { UsersService } from './users.service'
import { GetAuthUser } from './decorators/users.decorator'
import { Auth } from 'src/auth/decorators/auth.decorator'
import { UsersDashboardService } from './users-dashboard.service'

@Controller('users')
export class UsersController {
	constructor(
		private readonly usersService: UsersService,
		private readonly usersDashboardService: UsersDashboardService
	) {}

	@Auth()
	@Get('me')
	getMe(@GetAuthUser('id') userId: string) {
		return this.usersService.findById(userId)
	}

	@Auth()
	@Get('dashboard')
	dashboard(@GetAuthUser('id') id: string) {
		return this.usersDashboardService.dashboard(id)
	}
}
