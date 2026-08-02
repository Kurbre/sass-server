import { createParamDecorator } from '@nestjs/common'
import { User } from '@prisma/client'

export const GetAuthUser = createParamDecorator((key: keyof User, ctx) => {
	const req = ctx.switchToHttp().getRequest()

	const user = req.user

	return key ? user[key] : user
})
