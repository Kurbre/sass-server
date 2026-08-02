import { Body, Controller, Post, Req, Res } from '@nestjs/common'
import { AuthService } from './auth.service'
import { type Request, type Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { CreateUserDto } from 'src/users/dto/create-user.dto'
import { LoginDto } from './dto/login.dto'
import { Auth } from './decorators/auth.decorator'
import { GetAuthUser } from 'src/users/decorators/users.decorator'

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService
	) {}

	private setRefreshTokenCookie(token: string, res: Response) {
		res.cookie('refreshToken', token, {
			httpOnly: true,
			sameSite: 'lax',
			secure: this.configService.get('NODE_ENV') === 'production',
			maxAge: 7 * 24 * 60 * 60 * 1000
		})
	}

	@Post('register')
	async register(
		@Body() dto: CreateUserDto,
		@Res({ passthrough: true }) res: Response
	) {
		const { accessToken, refreshToken, user } =
			await this.authService.register(dto)

		this.setRefreshTokenCookie(refreshToken, res)

		return { accessToken, user }
	}

	@Post('login')
	async login(
		@Body() dto: LoginDto,
		@Res({ passthrough: true }) res: Response
	) {
		const { accessToken, refreshToken, user } =
			await this.authService.login(dto)

		this.setRefreshTokenCookie(refreshToken, res)

		return { accessToken, user }
	}

	@Post('logout')
	@Auth()
	async logout(
		@Res({ passthrough: true }) res: Response,
		@GetAuthUser('id') userId: string
	) {
		res.clearCookie('refreshToken')

		return this.authService.logout(userId)
	}

	@Post('refresh')
	async refresh(
		@Res({ passthrough: true }) res: Response,
		@Req() req: Request
	) {
		const currentRefreshToken = req.cookies['refreshToken']
		const userId =
			await this.authService.getUserFromRefreshToken(currentRefreshToken)

		const { accessToken } = await this.authService.refreshTokens(
			currentRefreshToken,
			userId
		)

		return { accessToken }
	}
}
