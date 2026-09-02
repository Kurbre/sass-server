import { PartialType } from '@nestjs/mapped-types'
import { CreateAccountDto } from './create-account.dto'
import { IsOptional, IsString, IsUrl } from 'class-validator'

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
	@IsString()
	@IsOptional()
	secuid?: string

	@IsUrl()
	@IsString()
	@IsOptional()
	avatarPath?: string
}
