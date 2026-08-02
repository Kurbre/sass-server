import { Controller, Get } from '@nestjs/common'
import { UsersService } from './users.service'
import { GetAuthUser } from './decorators/users.decorator'
import { Auth } from 'src/auth/decorators/auth.decorator'

@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Auth()
	@Get('me')
	getMe(@GetAuthUser('id') userId: string) {
		return this.usersService.findById(userId)
	}
}
