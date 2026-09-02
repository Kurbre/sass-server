import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { UsersDashboardService } from './users-dashboard.service'

@Module({
	controllers: [UsersController],
	providers: [UsersService, UsersDashboardService],
	exports: [UsersService]
})
export class UsersModule {}
