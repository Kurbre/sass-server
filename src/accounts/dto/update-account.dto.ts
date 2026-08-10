import { PartialType } from '@nestjs/mapped-types'
import { CreateAccountDto } from './create-account.dto'
import { IsOptional, IsString } from 'class-validator'

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
	@IsString()
	@IsOptional()
	secuid?: string
}
