import { AccountType } from '@prisma/client'
import {
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	MinLength
} from 'class-validator'

export class CreateAccountDto {
	@IsEnum(AccountType)
	type!: AccountType

	@IsOptional()
	@IsString()
	@MinLength(1)
	username?: string

	@IsOptional()
	@IsString()
	@MinLength(1)
	profilePath?: string

	@IsOptional()
	@IsBoolean()
	connected?: boolean
}
